const express = require("express");
const bodyParser = require("body-parser");
const Joi = require("joi");
const dayjs = require("dayjs");
const cors = require("cors");
const { MongoClient } = require("mongodb");
require("dotenv").config();

const app = express();
app.use(bodyParser.json());
app.use(cors());

const mongoClient = new MongoClient(process.env.DATABASE_URL);
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

const removeInactiveParticipants = async () => {
  const tenSecondsAgo = Date.now() - 10000;

  try {
    const result = await participantsCollection.deleteMany({
      lastStatus: { $lt: tenSecondsAgo },
    });

    const { deletedCount } = result;
    if (deletedCount > 0) {
      const removedParticipants = await participantsCollection
        .find({ lastStatus: { $lt: tenSecondsAgo } })
        .toArray();

      const removeMessage = {
        from: "Servidor",
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss"),
      };

      for (const participant of removedParticipants) {
        removeMessage.from = participant.name;
        await messagesCollection.insertOne(removeMessage);
      }

      console.log(`Removed ${deletedCount} inactive participant(s).`);
    }
  } catch (err) {
    console.error("Error removing inactive participants:", err);
  }
};

setInterval(removeInactiveParticipants, 15000);

// GET /participants
app.post("/participants", async (req, res) => {
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

  try {
    const existingParticipant = await participantsCollection.findOne({ name });
    if (existingParticipant) {
      return res
        .status(409)
        .json({ error: "O nome de participante já está sendo usado." });
    }

    const newParticipant = {
      name,
      lastStatus: Date.now(),
    };

    await participantsCollection.insertOne(newParticipant);

    const newMessage = {
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    };

    await messagesCollection.insertOne(newMessage);

    return res.status(201).json(newParticipant);
  } catch (err) {
    console.error("Error creating participant:", err);
    return res.status(500).json({ error: "Erro ao criar participante." });
  }
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

  if (!from) {
    return res
      .status(422)
      .json({ error: "Campo 'User' não está presente no header." });
  }

  participantsCollection
    .findOne({ name: from })
    .then((participant) => {
      if (!participant) {
        return res.status(404).json({ error: "Usuário não cadastrado." });
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
    })
    .catch((err) => {
      console.error("Error finding participant:", err);
      return res.status(500).json({ error: "Erro ao buscar participante." });
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
      // Verificar se o participante saiu da sala
      participantsCollection
        .findOne({ name: participantName })
        .then((participant) => {
          if (!participant) {
            const newMessage = {
              from: participantName,
              to: "Todos",
              text: "saiu da sala...",
              type: "status",
              time: dayjs().format("HH:mm:ss"),
            };

            messagesCollection
              .insertOne(newMessage)
              .then(() => {
                console.log("Mensagem enviada ao sair da sala:", newMessage);
              })
              .catch((err) => {
                console.error("Erro ao enviar mensagem:", err);
              });
          }
        })
        .catch((err) => {
          console.error("Erro ao encontrar participante:", err);
        });

      return res.status(200).send();
    })
    .catch((err) => {
      console.error("Erro ao atualizar status do participante:", err);
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

  participantsCollection
    .findOne({ name: participantName })
    .then((participant) => {
      if (!participant) {
        return res.status(422).json({ error: "Usuário não cadastrado." });
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
    })
    .catch((err) => {
      console.error("Error finding participant:", err);
      return res.status(500).json({ error: "Erro ao buscar participante." });
    });
});

const port = process.env.PORT;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
