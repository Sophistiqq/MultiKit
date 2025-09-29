import { Database } from "bun:sqlite"
import { Elysia, t } from "elysia";
import jwt from "@elysiajs/jwt";


const User = t.Object({
  username: t.String(),
  password: t.String(),
  email: t.String(),
  firstname: t.Optional(t.String()),
  lastname: t.Optional(t.String()),
  age: t.Optional(t.Number()),
  phone: t.Optional(t.String()),
  address: t.Optional(t.String()),
})


const db = new Database(":memory:");
// Create the users table

try {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    email TEXT NOT NULL,
    firstname TEXT,
    lastname TEXT,
    age INTEGER,
    phone TEXT,
    address TEXT
    );
`);

  db.run(`
    CREATE TABLE IF NOT EXISTS logged_in_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    logged_in_at TEXT NOT NULL,
    logged_out_at TEXT, 
    FOREIGN KEY (user_id) REFERENCES users(id)
    );
`)
  const adminPass = await Bun.password.hash("admin");
  // master account
  db.query(`INSERT INTO users (username, password, email, firstname, lastname, age, phone, address) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .values("admin", adminPass, "admin@example.com", "Admin", "User", 30, "1234567890", "123 Main St, Anytown, USA");

  console.log("Databases created successfully");
} catch (error) {
  console.error(error);
}

export const user = new Elysia({ prefix: '/auth' })
  .use(jwt({ secret: "secret" }))
  .post("/register", async ({ body }) => {
    const { username, password, email, firstname, lastname, age, phone, address } = body;
    const hashedPassword = await Bun.password.hash(password);
    const user = db.query(`SELECT * FROM users WHERE username = ?`).get(username);
    if (user) {
      return { message: "User already exists" };
    } else {
      db.query(`INSERT INTO users (username, password, email, firstname, lastname, age, phone, address) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .values(username, hashedPassword, email, firstname, lastname, age, phone, address);
    }
    return { message: "User registered successfully" };
  }, {
    body: User
  })
  .post("/login", async ({ body }) => {
    const { username, password } = body;
    const user: any = db.query(`SELECT * FROM users WHERE username = ?`).get(username);
    const matched = await Bun.password.verify(password, user.password);
    if (matched) {
      const loggedInUser = db.query(`SELECT * FROM logged_in_users WHERE user_id = ?`).get(user.id);
      if (loggedInUser) {
        return { message: "User already logged in" };
      } else {
        db.query(`INSERT INTO logged_in_users (user_id, logged_in_at, logged_out_at) 
                  VALUES (?, ?, ?)`)
          .values(user.id, new Date().toISOString(), null);
        return { message: "Login successful", user };
      }
    }
    return { message: "Invalid password" };
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String(),
    })
  })
  .post("/logout/:id", async ({ params }) => {
    db.query(`UPDATE logged_in_users SET logged_out_at = ? WHERE user_id = ?`)
      .values(new Date().toISOString(), params.id);
    return { status: "success", message: "User logged out" };
  }, {
    params: t.Object({
      id: t.Number(),
    })
  })
  .get("/check-auth/:id", async ({ params }) => {
    const loggedInUser = db.query(`SELECT * FROM logged_in_users WHERE user_id = ?`).get(params.id);
    if (loggedInUser) {
      return { status: "success", message: "User logged in" };
    }
    return { status: "failed", message: "User not logged in" };
  }, {
    params: t.Object({
      id: t.Number(),
    })
  })
  .get("/users", async () => {
    const users = db.query(`SELECT * FROM users`).all();
    return users;
  })
  .get("/logged-in-users", async () => {
    const users = db.query(`SELECT * FROM logged_in_users`).all();
    return users;
  })
  .get("/user/:id", async ({ params }) => {
    const user = db.query(`SELECT * FROM users WHERE id = ?`).get(params.id);
    return user;
  })
  // Edit
  .patch("/user/:id", async ({ params, body }) => {
    const { firstname, lastname, age, phone, address } = body;
    const user = db.query(`SELECT * FROM users WHERE id = ?`).get(params.id);
    if (user) {
      db.query(`UPDATE users SET firstname = ?, lastname = ?, age = ?, phone = ?, address = ? WHERE id = ?`)
        .values(firstname, lastname, age, phone, address, params.id);
      return { message: "User updated successfully" };
    } else {
      return { message: "User not found" };
    }
  }, {
    body: User,
    params: t.Object({
      id: t.Number(),
    })
  })
  .patch("/user/change-password/:id", async ({ params, body }) => {
    const { password } = body;
    const user = db.query(`SELECT * FROM users WHERE id = ?`).get(params.id);
    if (user) {
      const hashedPassword = await Bun.password.hash(password);
      db.query(`UPDATE users SET password = ? WHERE id = ?`)
        .values(hashedPassword, params.id);
      return { message: "Password changed successfully" };
    } else {
      return { message: "User not found" };
    }
  }, {
    body: t.Object({
      password: t.String(),
    }),
    params: t.Object({
      id: t.Number(),
    })
  })
  .delete("/user/:id", async ({ params }) => {
    const user = db.query(`SELECT * FROM users WHERE id = ?`).get(params.id);
    if (user) {
      db.query(`DELETE FROM users WHERE id = ?`).values(params.id);
      return { message: "User deleted successfully" };
    } else {
      return { message: "User not found" };
    }
  }, {
    params: t.Object({
      id: t.Number(),
    })
  })


