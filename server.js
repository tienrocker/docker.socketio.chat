const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const mongoose = require('mongoose');

const app = express();
app.get('/', function (req, res) {
    res.sendFile(__dirname + '/index.html');
});

const server = http.createServer(app);
const io = socketIo(server);

// Kết nối với MongoDB
mongoose.connect('mongodb://mongodb/chatdb', {useNewUrlParser: true, useUnifiedTopology: true});

// Định nghĩa Schema và Model cho tin nhắn
const messageSchema = new mongoose.Schema({
    user: String,
    message: String,
    time: {type: Date, default: Date.now}
});

const Message = mongoose.model('Message', messageSchema);

// Thiết lập kết nối socket
io.on('connection', (socket) => {
    console.log('User connected');

    // Lấy tất cả tin nhắn từ MongoDB và gửi đến client
    Message.find().sort({time: 1}).then(messages => {
        socket.emit('init', messages);
    });

    // Lắng nghe tin nhắn mới và lưu vào MongoDB
    socket.on('chat message', (msg) => {
        const newMessage = new Message(msg);
        newMessage.save().then(() => {
            io.emit('chat message', msg);
        });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected!');
    });
});

// Lắng nghe server
server.listen(3000, () => {
    console.log('Server run with http://localhost:3000');
});