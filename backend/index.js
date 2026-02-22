import express from "express";
import { connectDB } from "./config/db.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import authRouter from "./routes/authRoutes.js";
import cors from 'cors'
import http from 'http';
import { Server } from "socket.io";
import { initSocket } from "./sockets/index.js";

dotenv.config();



// Constants
const PORT = process.env.PORT || 8888;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:3000";
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND_URL, 
    methods: ["GET", "POST"],
    credentials: true, 
  },
  maxHttpBufferSize: 1e5,
  pingTimeout: 20000,
  pingInterval: 25000,
});

initSocket(io);

// Middlewares
app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: FRONTEND_URL,
  credentials: true,
}));

// Health Checking Route
app.get("/", (req, res) => {
  res.send("Backend is Working ...✅");
});

// Routes
app.use('/auth',authRouter)


// DB Connection
connectDB().then(() => {
  console.log("Connected to DB...");
  server.listen(PORT, () => {
    console.log(`Server is running at ${PORT}...`);
  });
});
