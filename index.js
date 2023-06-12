// Importar as bibliotecas necessárias
require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const shortid = require('shortid');
// Configurar o servidor Express
const app = express();
const server = http.createServer(app);
const io = socketIO(server);
const cors = require('cors')

// Conectar ao MongoDB
mongoose.connect(`mongodb+srv://${process.env.LOGIN_MONGO}:${process.env.PASS_MONGO}@cluster-teste.igkczc8.mongodb.net/?retryWrites=true&w=majority`, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('Conectado ao MongoDB');
  })
  .catch((error) => {
    console.error('Erro ao conectar ao MongoDB:', error);
  });

app.use(cors());
app.use('/files', express.static(__dirname + '/files'))
// Definir modelo de mensagem no MongoDB
const Message = mongoose.model('Message', {
  text: String,
  file: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  user: {
    type: String,
    default: 'Anônimo'
  },
  color: {
    type: String,
    default: getRandomColor()
  }
});

// Configurar o Multer para o upload de arquivos
const storage = multer.diskStorage({
  destination: 'files',
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}${ext}`);
  }
});
const upload = multer({ storage });

// Rota para upload de arquivos
app.post('/upload-audio', upload.single('audio'), (req, res) => {
  const { sender } = req.body;
  const audioUrl = `/files/${req.file.filename}`;

  const audioData = {
    nickname: sender,
    file: audioUrl
  };

  // Salvar as informações do áudio no MongoDB
  const audioMessage = new Message(audioData);
  audioMessage.save()
    .then(() => {
      res.json(audioData);
      // Enviar mensagem para todos os usuários conectados
      io.emit('message', audioMessage);
    })
    .catch((error) => {
      console.error('Erro ao salvar o áudio:', error);
      res.status(500).json({ error: 'Erro ao salvar o áudio' });
    });
});

// Rota principal para servir o HTML
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/pages/index.html');
});

// Configurar eventos do Socket.IO
io.on('connection', (socket) => {
  console.log('Novo usuário conectado');

  // Verificar se o usuário já possui informações salvas no localStorage
  let nickname = socket.handshake.query.nickname;
  let userId = socket.handshake.query.userId;

  // Gerar um ID curto para o usuário, caso não tenha
  if (!userId) {
    userId = `${nickname}-${shortid.generate()}`;
  }

  // Salvar as informações do usuário no localStorage
  socket.emit('saveUserInfo', { nickname, userId });

  // Definir o ID do usuário no socket
  socket.userId = userId;

  // Enviar mensagens existentes ao novo usuário
  Message.find()
    .sort({ createdAt: 1 })
    .then((messages) => {
      socket.emit('messages', messages);
    })
    .catch((error) => {
      console.error('Erro ao buscar mensagens:', error);
    });

  // Receber mensagem do cliente
  socket.on('message', (data) => {
    const { text, file } = data;

    // Salvar a mensagem no MongoDB
    const message = new Message({ text, file, user: socket.nickname, color: socket.color });
    message.save()
      .then(() => {
        // Enviar mensagem para todos os usuários conectados
        io.emit('message', message);
      })
      .catch((error) => {
        console.error('Erro ao salvar mensagem:', error);
      });
  });

  // Receber evento de usuário conectado
  socket.on('userConnected', (data) => {
    // Obter as informações do usuário
    const { nickname, userId } = data;

    // Gerar uma cor aleatória para o usuário
    const color = getRandomColor();

    // Atualizar as informações do usuário no socket
    socket.nickname = nickname;
    socket.userId = userId;
    socket.color = color;

    // Enviar evento para todos os usuários conectados
    io.emit('userConnected', { nickname, color });
  });

  // Receber evento de usuário desconectado
  socket.on('disconnect', () => {
    if (socket.nickname) {
      console.log('Usuário desconectado:', socket.nickname);

      // Enviar evento para todos os usuários conectados
      io.emit('userDisconnected', { nickname: socket.nickname });
    }
  });
});

// Função para gerar uma cor aleatória
function getRandomColor() {
  const letters = '0123456789ABCDEF';
  let color = '#';
  for (let i = 0; i < 6; i++) {
    color += letters[Math.floor(Math.random() * 16)];
  }
  return color;
}

// Iniciar o servidor
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Servidor iniciado em https://chat-real-time-oso7.onrender.com:${port}`);
});
