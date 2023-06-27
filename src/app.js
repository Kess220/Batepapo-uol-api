const express = require("express");
const bodyParser = require("body-parser");
const Joi = require("joi");
const dayjs = require("dayjs");
const cors = require("cors");

const app = express();
app.use(bodyParser.json());
app.use(cors());

const participants = [];
const messages = [];

// POST /participants
app.post("/participants", (req, res) => {
  const { name } = req.body;

  // Validar se o nome é uma string não vazia
  const schema = Joi.object({
    name: Joi.string().trim().required(),
  });

  const { error } = schema.validate({ name });

  if (error) {
    return res
      .status(422)
      .json({ error: "O nome é obrigatório e deve ser uma string não vazia." });
  }

  // Verificar se o nome já está sendo usado
  const participantExists = participants.find((p) => p.name === name);
  if (participantExists) {
    return res
      .status(409)
      .json({ error: "Esse nome já está sendo usado por outro participante." });
  }

  // Criar um novo participante
  const newParticipant = {
    name,
    lastStatus: Date.now(),
  };

  participants.push(newParticipant);

  return res.status(201).json(newParticipant);
});

// POST /messages
app.post("/messages", (req, res) => {
  const { to, text, type } = req.body;
  const from = req.header("User");

  // Validar os campos
  const schema = Joi.object({
    to: Joi.string().trim().required(),
    text: Joi.string().trim().required(),
    type: Joi.string().valid("message", "private_message").required(),
  });

  const { error } = schema.validate({ to, text, type });

  if (error) {
    return res.status(422).json({ error: "Parâmetros inválidos." });
  }

  // Verificar se o remetente está na lista de participantes
  const participant = participants.find((p) => p.name === from);
  if (!participant) {
    return res.status(422).json({ error: "Remetente inválido." });
  }

  // Criar a nova mensagem
  const newMessage = {
    from,
    to,
    text,
    type,
    time: dayjs().format("HH:mm:ss"),
  };

  messages.push(newMessage);

  return res.status(201).json({});
});

// GET /participants
app.get("/participants", (req, res) => {
  return res.status(200).json(participants);
});

// Rota para atualizar o status do participante
app.post("/status", (req, res) => {
  const participantName = req.header("User");

  if (!participantName) {
    return res.status(404).send();
  }

  const participant = participants.find((p) => p.name === participantName);
  if (!participant) {
    return res.status(404).send();
  }

  participant.lastStatus = Date.now();

  res.status(200).send();
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
