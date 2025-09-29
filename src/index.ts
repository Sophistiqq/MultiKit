// This server is used for sending me code snippets to make my interviews easier, like sending me a class for CRUD operations
import { Elysia } from "elysia";
import cors from "@elysiajs/cors";
import { user } from "./auth";
import swagger from "@elysiajs/swagger";

const PORT = process.env.PORT || 3000;

const app = new Elysia()
  .use(cors())
  .use(user)
  .use(swagger())
  .get("/help", () => {
    return Bun.file("public/Help.md");
  })
  .get("/class/user-manager", () => {
    return Bun.file("public/UserManager.ts")
  })
  .get("/class/todo-manager", () => {
    return Bun.file("public/ToDoManager.ts")
  })
  .listen(PORT);

console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`
);
