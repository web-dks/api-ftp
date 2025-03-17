# API Segura para Transferência FTP

Uma API RESTful para transferir arquivos para um servidor FTP de forma segura. A API pode baixar arquivos de URLs ou aceitar uploads diretos, e então transferi-los para um servidor FTP usando conexão segura.

## Funcionalidades

- Recebe URL de arquivo, caminho de destino e nome do arquivo
- Baixa o arquivo da URL fornecida
- Envia o arquivo para um servidor FTP via conexão segura (FTPS)
- Suporte para upload direto de arquivos (multipart/form-data)
- Implementação de medidas de segurança robustas
- Autenticação via token Bearer
- Limite de taxa para prevenir abusos
- Validação de entrada para prevenir injeções
- Logging completo para auditoria

## Requisitos

- Node.js 14.x ou superior
- Servidor FTP com suporte a conexões seguras (FTPS)

## Instalação

1. Clone o repositório:
```bash
git clone https://github.com/seu-usuario/secure-ftp-api.git
cd secure-ftp-api
```

2. Instale as dependências:
```bash
npm install
```

3. Configure o arquivo `.env` com suas credenciais:
```
PORT=3000
NODE_ENV=production
API_TOKEN=seu_token_seguro_aqui
FTP_HOST=seu_servidor_ftp.com
FTP_USER=seu_usuario
FTP_PASSWORD=sua_senha
```

4. Inicie o servidor:
```bash
npm start
```

Para desenvolvimento:
```bash
npm run dev
```

## Endpoints da API

### Recuperação de Arquivos

**Endpoint:** `GET /api/download`

**Headers:**
- `Authorization: Bearer seu_token_aqui`

**Query Parameters:**
- `path`: Caminho do diretório no servidor FTP
- `fileName`: Nome do arquivo a ser baixado

**Resposta:**
- O arquivo será enviado como download
- Em caso de erro, retornará um JSON com o erro

### Listar Arquivos em um Diretório

**Endpoint:** `GET /api/list`

**Headers:**
- `Authorization: Bearer seu_token_aqui`

**Query Parameters:**
- `path`: Caminho do diretório no servidor FTP a ser listado

**Resposta de sucesso:**
```json
{
  "success": true,
  "path": "/diretorio/exemplo",
  "files": [
    {
      "name": "arquivo1.pdf",
      "size": 12345,
      "type": 1,
      "modifiedDate": "2023-10-15T14:30:00.000Z",
      "isDirectory": false
    },
    {
      "name": "subdiretorio",
      "size": 0,
      "type": 2,
      "modifiedDate": "2023-10-14T09:15:00.000Z",
      "isDirectory": true
    }
  ]
}
```

### Upload via URL

**Endpoint:** `POST /api/upload`

**Headers:**
- `Authorization: Bearer seu_token_aqui`
- `Content-Type: application/json`

**Body:**
```json
{
  "urlFile": "https://exemplo.com/caminho/para/arquivo.pdf",
  "path": "/diretorio/destino",
  "fileName": "arquivo_renomeado.pdf"
}
```

**Resposta de sucesso:**
```json
{
  "success": true,
  "message": "Arquivo enviado com sucesso",
  "details": {
    "remotePath": "/diretorio/destino/arquivo_renomeado.pdf"
  }
}
```

### Upload direto de arquivo

**Endpoint:** `POST /api/upload/direct`

**Headers:**
- `Authorization: Bearer seu_token_aqui`
- `Content-Type: multipart/form-data`

**Form-data:**
- `file`: Arquivo a ser enviado
- `path`: Caminho de destino no servidor FTP
- `fileName`: (Opcional) Nome do arquivo no destino

**Resposta de sucesso:**
```json
{
  "success": true,
  "message": "Arquivo enviado com sucesso",
  "details": {
    "originalName": "arquivo_original.pdf",
    "size": 12345,
    "remotePath": "/diretorio/destino/arquivo_destino.pdf"
  }
}
```

## Segurança

A API implementa várias camadas de segurança:

1. **Autenticação**: Token Bearer para autenticar todas as requisições
2. **Headers de segurança HTTP**: Usando Helmet para configurar headers seguros
3. **Limitação de taxa**: Prevenção contra ataques de força bruta
4. **Conexão FTP segura**: Usando FTPS (FTP sobre SSL/TLS)
5. **Validação de entrada**: Verificação de parâmetros para prevenir injeções
6. **Arquivos temporários**: Limpeza automática após processamento
7. **Logging**: Registro detalhado para auditoria

## Desenvolvimento

### Estrutura de diretórios

```
secure-ftp-api/
├── server.js         # Ponto de entrada da aplicação
├── package.json      # Dependências e scripts
├── .env              # Variáveis de ambiente (não comitar!)
├── .gitignore        # Ignora arquivos para o Git
├── temp/             # Diretório para arquivos temporários (criado automaticamente)
└── tests/            # Testes automatizados (opcional)
```

### Contribuição

1. Faça um fork do projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-funcionalidade`)
3. Faça commit das alterações (`git commit -m 'Adiciona nova funcionalidade'`)
4. Faça push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## Licença

Este projeto está licenciado sob a licença MIT - veja o arquivo LICENSE para detalhes.