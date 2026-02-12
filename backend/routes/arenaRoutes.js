import { Router } from "express";
import {
  createArena,
  finishArena,
  getArenaByRoomCode,
  getArenaLeaderboard,
  getArenaSubmissions,
  getArenaTimer,
  joinArena,
  setReadyStatus,
  startArena,
  submitSolution,
} from "../controllers/arenaController.js";

const router = Router();

router.post("/", createArena);
router.get("/:roomCode", getArenaByRoomCode);
router.post("/:roomCode/join", joinArena);
router.patch("/:roomCode/ready", setReadyStatus);
router.patch("/:roomCode/start", startArena);
router.get("/:roomCode/timer", getArenaTimer);
router.get("/:roomCode/leaderboard", getArenaLeaderboard);
router.get("/:roomCode/submissions", getArenaSubmissions);
router.post("/:roomCode/submissions", submitSolution);
router.patch("/:roomCode/finish", finishArena);

export default router;
