// server.js - API Node.js para upload seguro de arquivos via FTP

const express = require('express');
const multer = require('multer');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ftp = require('basic-ftp');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

// Carregar variáveis de ambiente
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Diretório para download temporário de arquivos
const DOWNLOAD_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOAD_DIR)) {
  fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });
}

// Configurações de segurança
app.use(helmet()); // Headers de segurança HTTP
app.use(express.json());
app.use(morgan('combined')); // Logging

// Limitador de taxa para prevenir ataques de força bruta
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // limite de 100 requisições por IP
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/upload', limiter);

// Configuração de armazenamento temporário
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    // Gerar nome de arquivo único para evitar colisões
    const uniqueSuffix = uuidv4();
    cb(null, `${uniqueSuffix}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // Limite de 10MB para upload
});

// Middleware de autenticação
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  const token = authHeader.split(' ')[1];

  // Verificar token (em produção, use JWT ou outro método seguro)
  if (token !== process.env.API_TOKEN) {
    return res.status(403).json({ error: 'Token inválido' });
  }

  next();
};

// Função para baixar arquivo de uma URL
async function downloadFile(url, destPath) {
  const response = await axios({
    method: 'GET',
    url: url,
    responseType: 'stream',
  });

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    response.data.pipe(writer);

    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

// Função para baixar arquivo do servidor FTP
async function downloadFromFtp(remotePath, fileName, localFilePath) {
  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      port: parseInt(process.env.FTP_PORT) || 21,
      secure: process.env.FTP_TYPE === 'FTPS',
      secureOptions: { rejectUnauthorized: false }
    });

    // Navegar para o diretório remoto
    try {
      await client.cd(remotePath);
    } catch (error) {
      console.error(`Erro ao acessar diretório ${remotePath}:`, error);
      throw new Error(`Diretório não encontrado: ${remotePath}`);
    }

    // Verificar se o arquivo existe
    const fileList = await client.list();
    const fileExists = fileList.some(item => item.name === fileName);

    if (!fileExists) {
      throw new Error(`Arquivo não encontrado: ${fileName}`);
    }

    // Download do arquivo
    await client.downloadTo(localFilePath, fileName);
    return true;
  } catch (error) {
    console.error('Erro no download FTP:', error);
    throw error;
  } finally {
    client.close();
  }
}

// Função para enviar arquivo para servidor FTP
async function uploadToFtp(localFilePath, remotePath, fileName) {
  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      port: parseInt(process.env.FTP_PORT) || 21,
      secure: process.env.FTP_TYPE === 'FTPS',
      secureOptions: { rejectUnauthorized: false } // Para servidores com certificados auto-assinados
    });

    // Navegar/criar diretório remoto (criar estrutura de diretórios recursivamente)
    const dirs = remotePath.split('/').filter(Boolean);
    let currentPath = '';

    for (const dir of dirs) {
      currentPath += `/${dir}`;
      try {
        await client.ensureDir(currentPath);
      } catch (error) {
        console.error(`Erro ao criar diretório ${currentPath}:`, error);
        throw error;
      }
    }

    // Upload do arquivo
    await client.uploadFrom(localFilePath, `${remotePath}/${fileName}`);
    return true;
  } catch (error) {
    console.error('Erro na transferência FTP:', error);
    throw error;
  } finally {
    client.close();
  }
}

// Rota principal para processar o upload
app.post('/api/upload', authenticate, async (req, res) => {
  try {
    const { urlFile, base64File, path: remotePath, fileName } = req.body;

    // Verificar se pelo menos um dos métodos de upload foi fornecido
    if ((!urlFile && !base64File) || !remotePath || !fileName) {
      return res.status(400).json({
        error: 'Parâmetros incompletos. É necessário fornecer urlFile ou base64File, além de path e fileName'
      });
    }

    // Validar fileName para evitar injeção de caminho
    if (fileName.includes('/') || fileName.includes('\\')) {
      return res.status(400).json({
        error: 'Nome de arquivo inválido. Não pode conter caracteres de caminho'
      });
    }

    // Criar caminho temporário para o arquivo
    const tempFilePath = path.join(__dirname, 'temp', `temp-${uuidv4()}`);

    try {
      let fileInfo = {
        size: 0,
        contentType: null
      };

      // Processo de obtenção do arquivo (URL ou base64)
      if (urlFile) {
        // Método 1: URL - Validar URL
        try {
          new URL(urlFile);
        } catch (e) {
          return res.status(400).json({
            error: 'URL inválida. Forneça uma URL completa e válida',
            details: e.message
          });
        }

        // Baixar arquivo da URL
        console.log(`[${new Date().toISOString()}] Iniciando download de: ${urlFile}`);
        fileInfo = await downloadFile(urlFile, tempFilePath);
        console.log(`[${new Date().toISOString()}] Arquivo baixado: ${tempFilePath} (${fileInfo.size} bytes)`);
      }
      else if (base64File) {
        // Método 2: Base64
        try {
          // Verificar se o base64 tem o prefixo de data URI
          let base64Data = base64File;
          let detectedContentType = null;

          // Se tiver o formato data:mimetype;base64,data
          if (base64File.includes(';base64,')) {
            const parts = base64File.split(';base64,');
            if (parts.length >= 2) {
              detectedContentType = parts[0].replace('data:', '');
              base64Data = parts[1];
            }
          }

          // Decodificar o base64
          const buffer = Buffer.from(base64Data, 'base64');

          // Verificar se o buffer parece válido
          if (buffer.length === 0) {
            return res.status(400).json({
              error: 'Dados base64 inválidos ou vazios'
            });
          }

          // Escrever para o arquivo temporário
          fs.writeFileSync(tempFilePath, buffer);

          // Obter informações do arquivo
          const stats = fs.statSync(tempFilePath);
          fileInfo = {
            size: stats.size,
            contentType: detectedContentType,
            path: tempFilePath
          };

          console.log(`[${new Date().toISOString()}] Arquivo base64 processado: ${tempFilePath} (${fileInfo.size} bytes)`);

          // Verificação adicional se o arquivo é muito pequeno
          if (fileInfo.size < 100) {
            // Verificar se é conteúdo HTML
            const fileContent = fs.readFileSync(tempFilePath, { encoding: 'utf8' });
            if (fileContent.includes('<!DOCTYPE html>') || fileContent.includes('<html>')) {
              fs.unlinkSync(tempFilePath);
              return res.status(400).json({
                error: 'Os dados base64 parecem ser HTML, não um arquivo válido',
              });
            }
          }
        } catch (base64Error) {
          return res.status(400).json({
            error: 'Erro ao processar dados base64',
            details: base64Error.message
          });
        }
      }

      // Se chegou até aqui, temos um arquivo válido para enviar ao FTP
      console.log(`[${new Date().toISOString()}] Enviando para FTP: ${remotePath}/${fileName}`);
      await uploadToFtp(tempFilePath, remotePath, fileName);
      console.log(`[${new Date().toISOString()}] Arquivo enviado com sucesso`);

      // Limpar arquivo temporário
      fs.unlinkSync(tempFilePath);

      res.status(200).json({
        success: true,
        message: 'Arquivo enviado com sucesso',
        details: {
          remotePath: `${remotePath}/${fileName}`,
          size: fileInfo.size,
          contentType: fileInfo.contentType,
          source: urlFile ? 'url' : 'base64'
        }
      });
    } catch (error) {
      // Limpar arquivo temporário em caso de erro
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        console.error(`[${new Date().toISOString()}] Erro ao limpar arquivo temporário: ${cleanupError.message}`);
      }

      console.error(`[${new Date().toISOString()}] Erro no processamento do upload: ${error.message}`);

      // Personalizar mensagem de erro com base no tipo de erro
      let statusCode = 500;
      let errorMessage = 'Erro ao processar o upload';

      if (error.message.includes('HTML') || error.message.includes('página web')) {
        statusCode = 400;
        errorMessage = 'O URL fornecido não é um link direto para download. Use uma URL que aponte diretamente para o arquivo.';
      } else if (error.message.includes('ENOTFOUND') || error.message.includes('ETIMEDOUT')) {
        statusCode = 400;
        errorMessage = 'Não foi possível acessar o URL. Verifique se o endereço está correto e acessível.';
      } else if (error.message.includes('status code')) {
        statusCode = 400;
        errorMessage = 'O servidor remoto retornou um erro ao tentar baixar o arquivo.';
      }

      res.status(statusCode).json({
        error: errorMessage,
        details: error.message
      });
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Erro geral: ${error.message}`);
    res.status(500).json({
      error: 'Erro ao processar o upload',
      details: error.message
    });
  }
});

// Rota alternativa para upload direto de arquivo (multipart/form-data)
app.post('/api/upload/direct', authenticate, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado' });
    }

    const { path: remotePath, fileName } = req.body;
    const uploadedFile = req.file;

    if (!remotePath) {
      return res.status(400).json({ error: 'Caminho remoto não especificado' });
    }

    // Usar nome original do arquivo se fileName não for fornecido
    const finalFileName = fileName || uploadedFile.originalname;

    // Enviar arquivo para o FTP
    await uploadToFtp(uploadedFile.path, remotePath, finalFileName);
    console.log(`Arquivo enviado para FTP: ${remotePath}/${finalFileName}`);

    // Limpar arquivo temporário
    fs.unlinkSync(uploadedFile.path);

    res.status(200).json({
      success: true,
      message: 'Arquivo enviado com sucesso',
      details: {
        originalName: uploadedFile.originalname,
        size: uploadedFile.size,
        remotePath: `${remotePath}/${finalFileName}`
      }
    });
  } catch (error) {
    console.error('Erro no processamento do upload direto:', error);
    res.status(500).json({
      error: 'Erro ao processar o upload',
      details: error.message
    });
  }
});

// Rota para recuperar arquivo do FTP
app.get('/api/download', authenticate, async (req, res) => {
  try {
    const { path: remotePath, fileName } = req.query;

    if (!remotePath || !fileName) {
      return res.status(400).json({
        error: 'Parâmetros incompletos. É necessário fornecer path e fileName'
      });
    }

    // Validar fileName para evitar injeção de caminho
    if (fileName.includes('/') || fileName.includes('\\')) {
      return res.status(400).json({
        error: 'Nome de arquivo inválido. Não pode conter caracteres de caminho'
      });
    }

    // Criar caminho temporário para o arquivo
    const uniqueId = uuidv4();
    const tempFilePath = path.join(DOWNLOAD_DIR, `${uniqueId}-${fileName}`);

    // Baixar arquivo do FTP
    await downloadFromFtp(remotePath, fileName, tempFilePath);
    console.log(`Arquivo baixado do FTP: ${remotePath}/${fileName}`);

    // Enviar arquivo como resposta
    res.download(tempFilePath, fileName, (err) => {
      if (err) {
        console.error('Erro ao enviar arquivo:', err);
      }

      // Limpar arquivo temporário após envio (ou em caso de erro)
      try {
        fs.unlinkSync(tempFilePath);
      } catch (cleanupError) {
        console.error('Erro ao limpar arquivo temporário:', cleanupError);
      }
    });
  } catch (error) {
    console.error('Erro ao recuperar arquivo:', error);

    if (error.message.includes('não encontrado')) {
      return res.status(404).json({
        error: 'Arquivo ou diretório não encontrado',
        details: error.message
      });
    }

    res.status(500).json({
      error: 'Erro ao recuperar o arquivo',
      details: error.message
    });
  }
});

// Rota para listar arquivos em um diretório FTP
app.get('/api/list', authenticate, async (req, res) => {
  const client = new ftp.Client();
  client.ftp.verbose = process.env.NODE_ENV === 'development';

  // Aumentar o timeout
  client.ftp.timeout = 30000; // 30 segundos (padrão é 15s)

  try {
    const { path: remotePath } = req.query;


    console.log(`Tentando listar arquivos em: ${remotePath}`);
    console.log(`Conectando ao servidor: ${process.env.FTP_HOST}:${process.env.FTP_PORT}`);


    if (!remotePath) {
      return res.status(400).json({
        error: 'Caminho remoto não especificado'
      });
    }

    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASSWORD,
      port: parseInt(process.env.FTP_PORT) || 21,
      secure: process.env.FTP_TYPE === 'FTPS',
      secureOptions: { rejectUnauthorized: false }
    });

    // Após conexão bem-sucedida
    console.log("Conexão FTP estabelecida com sucesso");

    try {
      console.log(`Tentando acessar diretório: ${remotePath}`);
      await client.cd(remotePath);
      console.log("Diretório acessado com sucesso");
    } catch (error) {
      console.error(`Erro ao acessar diretório: ${error.message}`);
      return res.status(404).json({
        error: `Diretório não encontrado: ${remotePath}`
      });
    }

    console.log("Listando arquivos...");
    const list = await client.list();
    console.log(`Encontrados ${list.length} itens`);

    // Formatar a lista de arquivos
    const files = list.map(item => ({
      name: item.name,
      size: item.size,
      idType: item.type, // 1=arquivo, 2=diretório
      type: item.type === 2 ? "pasta" : "arquivo",
      modifiedDate: item.modifiedAt,
      isDirectory: item.type === 2
    }));

    res.status(200).json({
      success: true,
      path: remotePath,
      files: files
    });
  } catch (error) {
    console.error('Erro ao listar arquivos:', error);
    res.status(500).json({
      error: 'Erro ao listar arquivos',
      details: error.message
    });
  } finally {
    client.close();
  }
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);

  // Criar diretórios necessários
  const dirs = ['temp', 'downloads'];
  dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Diretório criado: ${dir}`);
    }
  });
});

module.exports = app; // Para testes