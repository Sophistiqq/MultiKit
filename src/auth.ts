import { Database } from "bun:sqlite";
import { Elysia, t } from "elysia";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";

const db = new Database(":memory:");

// Initialize database
try {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      firstname TEXT,
      lastname TEXT,
      age INTEGER,
      phone TEXT,
      address TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Simplified session tracking (optional for analytics)
  db.run(`
    CREATE TABLE IF NOT EXISTS login_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      logged_in_at TEXT NOT NULL,
      logged_out_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  const adminPass = await Bun.password.hash("admin");
  db.query(`INSERT OR IGNORE INTO users (username, password, email, firstname, lastname, age, phone, address) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run("admin", adminPass, "admin@example.com", "Admin", "User", 30, "1234567890", "123 Main St");

  console.log("Database initialized successfully");
} catch (error) {
  console.error("Database initialization error:", error);
}

// Validation schemas
const RegisterSchema = t.Object({
  username: t.String({ minLength: 3, maxLength: 50 }),
  password: t.String({ minLength: 8 }),
  email: t.String({ format: "email" }),
  firstname: t.Optional(t.String()),
  lastname: t.Optional(t.String()),
  age: t.Optional(t.Number({ minimum: 1, maximum: 150 })),
  phone: t.Optional(t.String()),
  address: t.Optional(t.String()),
});

const LoginSchema = t.Object({
  username: t.String(),
  password: t.String(),
});

const UpdateUserSchema = t.Object({
  firstname: t.Optional(t.String()),
  lastname: t.Optional(t.String()),
  age: t.Optional(t.Number({ minimum: 1, maximum: 150 })),
  phone: t.Optional(t.String()),
  address: t.Optional(t.String()),
});

const ChangePasswordSchema = t.Object({
  currentPassword: t.String(),
  newPassword: t.String({ minLength: 8 }),
});

// Authentication service
const authService = new Elysia({ name: "auth-service" })
  .use(jwt({
    name: "jwt",
    secret: process.env.JWT_SECRET || "Multi-Kit",
    exp: "7d" // Token expires in 7 days
  }))
  .use(cookie())
  // Macro for protected routes
  .macro({
    isAuthenticated: {
      cookie: t.Cookie({
        token: t.Optional(t.String())
      }),
      async resolve({ cookie: { token }, jwt, error }) {
        if (!token.value) {
          return error(401, { message: "Not authenticated" });
        }

        const payload = await jwt.verify(token.value);
        if (!payload) {
          token.remove();
          return error(401, { message: "Invalid token" });
        }

        const user: any = db.query(`SELECT id, username, email, firstname, lastname FROM users WHERE id = ?`)
          .get(payload.userId);

        if (!user) {
          token.remove();
          return error(401, { message: "User not found" });
        }

        return { user };
      }
    }
  });

// Main auth routes
export const user = new Elysia({ prefix: "/auth" })
  .use(authService)

  // Register
  .post("/register", async ({ body, error }) => {
    const { username, password, email, ...profile } = body;

    // Check if user exists
    const existingUser = db.query(`SELECT id FROM users WHERE username = ? OR email = ?`)
      .get(username, email);

    if (existingUser) {
      return error(409, { message: "Username or email already exists" });
    }

    const hashedPassword = await Bun.password.hash(password);

    try {
      const result = db.query(`
        INSERT INTO users (username, password, email, firstname, lastname, age, phone, address) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        username,
        hashedPassword,
        email,
        profile.firstname,
        profile.lastname,
        profile.age,
        profile.phone,
        profile.address
      );

      return {
        message: "User registered successfully",
        userId: result.lastInsertRowid
      };
    } catch (err) {
      return error(500, { message: "Registration failed" });
    }
  }, {
    body: RegisterSchema
  })

  // Login
  .post("/login", async ({ body, jwt, cookie: { token }, error }) => {
    const { username, password } = body;

    const user: any = db.query(`SELECT * FROM users WHERE username = ?`)
      .get(username);

    if (!user) {
      return error(401, { message: "Invalid credentials" });
    }

    const isValidPassword = await Bun.password.verify(password, user.password);
    if (!isValidPassword) {
      return error(401, { message: "Invalid credentials" });
    }

    // Generate JWT token
    const jwtToken = await jwt.sign({
      userId: user.id,
      username: user.username
    });

    // Set HTTP-only cookie
    token.set({
      value: jwtToken,
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: "/",
      sameSite: "lax",
    });

    // Log login history
    db.query(`INSERT INTO login_history (user_id, logged_in_at) VALUES (?, ?)`)
      .run(user.id, new Date().toISOString());

    const { password: _, ...userWithoutPassword } = user;
    return {
      message: "Login successful",
      user: userWithoutPassword
    };
  }, {
    body: LoginSchema
  })

  // Logout
  .post("/logout", ({ cookie: { token }, user }) => {
    if (user) {
      db.query(`UPDATE login_history SET logged_out_at = ? 
                WHERE user_id = ? AND logged_out_at IS NULL`)
        .run(new Date().toISOString(), user.id);
    }

    token.remove();
    return { message: "Logged out successfully" };
  }, {
    isAuthenticated: true
  })

  // Get current user
  .get("/me", ({ user }) => user, {
    isAuthenticated: true
  })

  // Update current user profile
  .patch("/me", ({ user, body, error }) => {
    try {
      const updates: string[] = [];
      const values: any[] = [];

      Object.entries(body).forEach(([key, value]) => {
        if (value !== undefined) {
          updates.push(`${key} = ?`);
          values.push(value);
        }
      });

      if (updates.length === 0) {
        return error(400, { message: "No fields to update" });
      }

      values.push(user.id);
      db.query(`UPDATE users SET ${updates.join(", ")} WHERE id = ?`)
        .run(...values);

      return { message: "Profile updated successfully" };
    } catch (err) {
      return error(500, { message: "Update failed" });
    }
  }, {
    body: UpdateUserSchema,
    isAuthenticated: true
  })

  // Change password
  .patch("/change-password", async ({ user, body, cookie: { token }, error }) => {
    const { currentPassword, newPassword } = body;

    const dbUser: any = db.query(`SELECT password FROM users WHERE id = ?`)
      .get(user.id);

    const isValidPassword = await Bun.password.verify(currentPassword, dbUser.password);
    if (!isValidPassword) {
      return error(401, { message: "Current password is incorrect" });
    }

    const hashedPassword = await Bun.password.hash(newPassword);
    db.query(`UPDATE users SET password = ? WHERE id = ?`)
      .run(hashedPassword, user.id);

    // Invalidate current token by removing cookie
    token.remove();

    return { message: "Password changed successfully. Please login again." };
  }, {
    body: ChangePasswordSchema,
    isAuthenticated: true
  })

  // Admin routes - Get all users
  .get("/users", ({ user, error }) => {
    // You might want to add admin role check here
    const users = db.query(`SELECT id, username, email, firstname, lastname, created_at FROM users`)
      .all();
    return users;
  }, {
    isAuthenticated: true
  })

  // Delete user (admin or self)
  .delete("/user/:id", ({ params, user, error }) => {
    const userId = parseInt(params.id);

    // Allow users to delete themselves, or add admin check
    if (user.id !== userId) {
      return error(403, { message: "Cannot delete other users" });
    }

    db.query(`DELETE FROM users WHERE id = ?`).run(userId);
    return { message: "User deleted successfully" };
  }, {
    params: t.Object({
      id: t.String()
    }),
    isAuthenticated: true
  });
