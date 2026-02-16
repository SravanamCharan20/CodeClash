import express from "express";
import { connectDB } from "./config/db.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import authRouter from "./routes/authRoutes.js";

dotenv.config();
const PORT = process.env.PORT || 8888;
const app = express();

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("Backend is Working ...✅");
});


app.use('/auth',authRouter)

connectDB().then(() => {
  console.log("Connected to DB...");
  app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}...`);
  });
});
