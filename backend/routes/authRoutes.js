import express from "express";
import User from "../models/User.js";
import { authorizeRoles, requireAuth } from "../middlewares/auth.js";

const authRouter = express.Router();

authRouter.post("/signup", async (req, res) => {
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
    console.error("Error : ", error.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

authRouter.post("/signin", async (req, res) => {
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

    const token = existingUser.getJWT();
    const userInfo = existingUser.toJSON();

    const expirationDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    res.cookie("token", token, { expires: expirationDate });
    return res.status(200).json({
      message: "Login successful",
      user: userInfo,
    });
  } catch (error) {
    console.error("Error : ", error.message);
    return res.status(500).json({
      message: "Internal server error",
    });
  }
});

authRouter.post("/logout", (req, res) => {
  res.cookie("token", "", {
    expires: new Date(0),
  });

  res.json({ message: "Logged out successfully" });
});

authRouter.get("/profile", requireAuth, (req, res) => {
  res.json({
    message: "Profile fetched successfully",
    user: req.user,
  });
});

authRouter.get(
  "/admin/dashboard",
  requireAuth,
  authorizeRoles("admin"),
  (req, res) => {
    res.json({
      message: "Welcome Admin 👑",
    });
  }
);

export default authRouter;
