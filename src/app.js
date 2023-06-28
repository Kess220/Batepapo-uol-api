const express = require("express");
const bodyParser = require("body-parser");
const Joi = require("joi");
const dayjs = require("dayjs");
const cors = require("cors");
const { MongoClient } = require("mongodb");

const app = express();
app.use(bodyParser.json());
app.use(cors());

const mongoClient = new MongoClient("mongodb://127.0.0.1:27017/aulas");
let db;
let participantsCollection;
let messagesCollection;

mongoClient
  .connect()
  .then(() => {
    db = mongoClient.db();
    participantsCollection = db.collection("participants");
    messagesCollection = db.collection("messages");
    console.log("Connected to MongoDB");
  })
  .catch((err) => console.log(err.message));

// POST /participants
app.post("/participants", (req, res) => {
  const { name } = req.body;

  const schema = Joi.object({
    name: Joi.string().trim().required(),
  });

  const { error } = schema.validate({ name });

  if (error) {
    return res
      .status(422)
      .json({ error: "O nome é obrigatório e deve ser uma string não vazia." });
  }

  const newParticipant = {
    name,
    lastStatus: Date.now(),
  };

  participantsCollection
    .insertOne(newParticipant)
    .then(() => {
      return res.status(201).json(newParticipant);
    })
    .catch((err) => {
      console.error("Error creating participant:", err);
      return res.status(500).json({ error: "Erro ao criar participante." });
    });
});

// POST /messages
app.post("/messages", (req, res) => {
  const { to, text, type } = req.body;
  const from = req.header("User");

  const schema = Joi.object({
    to: Joi.string().trim().required(),
    text: Joi.string().trim().required(),
    type: Joi.string().valid("message", "private_message").required(),
  });

  const { error } = schema.validate({ to, text, type });

  if (error) {
    return res.status(422).json({ error: "Parâmetros inválidos." });
  }

  const newMessage = {
    from,
    to,
    text,
    type,
    time: dayjs().format("HH:mm:ss"),
  };

  messagesCollection
    .insertOne(newMessage)
    .then(() => {
      return res.status(201).json(newMessage);
    })
    .catch((err) => {
      console.error("Error creating message:", err);
      return res.status(500).json({ error: "Erro ao criar mensagem." });
    });
});

// GET /participants
app.get("/participants", (req, res) => {
  participantsCollection
    .find()
    .toArray()
    .then((participants) => {
      return res.status(200).json(participants);
    })
    .catch((err) => {
      console.error("Error retrieving participants:", err);
      return res.status(500).json({ error: "Erro ao obter participantes." });
    });
});

// POST /status
app.post("/status", (req, res) => {
  const participantName = req.header("User");

  if (!participantName) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  participantsCollection
    .updateOne({ name: participantName }, { $set: { lastStatus: Date.now() } })
    .then(() => {
      return res.status(200).send();
    })
    .catch((err) => {
      console.error("Error updating participant status:", err);
      return res.status(500).json({ error: "Erro ao atualizar status." });
    });
});

// GET /messages
app.get("/messages", (req, res) => {
  const { limit } = req.query;
  const participantName = req.header("User");

  if (!participantName) {
    return res.status(401).json({ error: "Usuário não autenticado." });
  }

  let query = {
    $or: [
      { to: participantName },
      { from: participantName },
      { to: "Todos" },
      { type: "message" },
    ],
  };

  if (limit) {
    const parsedLimit = parseInt(limit);
    if (isNaN(parsedLimit) || parsedLimit <= 0) {
      return res.status(422).json({ error: "Parâmetro 'limit' inválido." });
    }
    query = messagesCollection.find(query).limit(parsedLimit);
  } else {
    query = messagesCollection.find(query);
  }

  query
    .toArray()
    .then((messages) => {
      return res.status(200).json(messages);
    })
    .catch((err) => {
      console.error("Error retrieving messages:", err);
      return res.status(500).json({ error: "Erro ao obter mensagens." });
    });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
