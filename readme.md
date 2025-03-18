# Upload de Arquivos via URL ou Base64

## Endpoint: `POST /api/upload`

Este endpoint permite enviar arquivos para o servidor FTP de duas formas diferentes:
1. A partir de uma URL
2. A partir de dados codificados em Base64

### Headers:
- `Authorization: Bearer seu_token_aqui`
- `Content-Type: application/json`

### Método 1: Upload via URL

**Body:**
```json
{
  "urlFile": "https://exemplo.com/caminho/para/arquivo.pdf",
  "path": "/diretorio/destino",
  "fileName": "arquivo_renomeado.pdf"
}
```

### Método 2: Upload via Base64

**Body:**
```json
{
  "base64File": "JVBERi0xLjMKJcTl8uXrp/Og0...", // String Base64 (pode incluir ou não o prefixo data URI)
  "path": "/diretorio/destino",
  "fileName": "arquivo_renomeado.pdf"
}
```

> **Nota:** O campo `base64File` pode ser uma string Base64 pura ou incluir o prefixo de data URI (ex: `data:application/pdf;base64,JVBERi...`).

### Resposta de sucesso:
```json
{
  "success": true,
  "message": "Arquivo enviado com sucesso",
  "details": {
    "remotePath": "/diretorio/destino/arquivo_renomeado.pdf",
    "size": 12345,
    "contentType": "application/pdf",
    "source": "url" // ou "base64"
  }
}
```

### Respostas de erro:

**Parâmetros incompletos:**
```json
{
  "error": "Parâmetros incompletos. É necessário fornecer urlFile ou base64File, além de path e fileName"
}
```

**URL inválida:**
```json
{
  "error": "URL inválida. Forneça uma URL completa e válida",
  "details": "Detalhes do erro"
}
```

**Base64 inválido:**
```json
{
  "error": "Dados base64 inválidos ou vazios"
}
```

**Página HTML ao invés de arquivo:**
```json
{
  "error": "O URL fornecido não é um link direto para download. Use uma URL que aponte diretamente para o arquivo."
}
```

## Exemplos de uso

### Exemplo com cURL (URL):
```bash
curl -X POST https://sua-api.onrender.com/api/upload \
  -H "Authorization: Bearer seu_token_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "urlFile": "https://exemplo.com/arquivo.pdf",
    "path": "/pasta",
    "fileName": "documento.pdf"
  }'
```

### Exemplo com cURL (Base64):
```bash
curl -X POST https://sua-api.onrender.com/api/upload \
  -H "Authorization: Bearer seu_token_aqui" \
  -H "Content-Type: application/json" \
  -d '{
    "base64File": "JVBERi0xLjMKJcTl8uXrp/Og0...",
    "path": "/pasta",
    "fileName": "documento.pdf"
  }'
```

### Exemplo com JavaScript (URL):
```javascript
fetch('https://sua-api.onrender.com/api/upload', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer seu_token_aqui',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    urlFile: 'https://exemplo.com/arquivo.pdf',
    path: '/pasta',
    fileName: 'documento.pdf'
  })
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Erro:', error));
```

### Exemplo com JavaScript (Base64):
```javascript
// Converter um arquivo para Base64
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Exemplo com input de arquivo
document.getElementById('fileInput').addEventListener('change', async function(e) {
  const file = e.target.files[0];
  const base64 = await fileToBase64(file);
  
  fetch('https://sua-api.onrender.com/api/upload', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer seu_token_aqui',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      base64File: base64,
      path: '/pasta',
      fileName: file.name
    })
  })
  .then(response => response.json())
  .then(data => console.log(data))
  .catch(error => console.error('Erro:', error));
});
```