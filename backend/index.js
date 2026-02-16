import express from "express";
import { connectDB } from "./config/db.js";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import User from "./models/User.js";

dotenv.config();
const PORT = process.env.PORT || 8888;
const app = express();

app.use(express.json());
app.use(cookieParser());

app.get("/", (req, res) => {
  res.send("Backend is Working ...✅");
});

app.post("/auth/signup", async (req, res) => {
  try {
    let { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    email = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email });

    if (existingUser) {
      return res.status(409).json({
        message: "Email already registered",
      });
    }

    const newUser = await User.create({
      username,
      email,
      password,
    });

    const userResponse = {
      id: newUser._id,
      username: newUser.username,
      email: newUser.email,
    };

    return res.status(201).json({
      message: "User created successfully",
      user: userResponse,
    });
  } catch (error) {
    console.error("Error : ",error.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

app.post("/auth/signin", async (req, res) => {
  try {
    let { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required",
      });
    }

    email = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const validPassword = await existingUser.isValidPassword(password);

    if (!validPassword) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    const userInfo = existingUser.toJSON();
    return res.status(200).json({
      message: "Login successful",
      user: userInfo,
    });

  } catch (error) {
    console.error("Error : ",error.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});




connectDB().then(() => {
  console.log("Connected to DB...");
  app.listen(PORT, () => {
    console.log(`Server is running at ${PORT}...`);
  });
});
