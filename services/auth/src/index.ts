import app from './app.js';
import dotenv from 'dotenv';
import { sql } from './utils/db.js';
import {createClient} from 'redis';

dotenv.config();
//dont write app.ts cause it gives build error during production


export const redisClient = createClient({
  url: process.env.REDIS_URL,
  socket: {
    tls: true,
    rejectUnauthorized: false,
  },
});

redisClient.connect()
  .then(() => {
    console.log("✅ Connected to Redis successfully");
  })
  .catch((error) => {
    console.error("❌ Failed to connect to Redis", error);
    process.exit(1);
  });




async function inintDb() {
    try {
        await sql `
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1
                FROM pg_type
                WHERE typname = 'user_role'
            ) THEN
                CREATE TYPE user_role AS ENUM ('jobseeker', 'recruiter');
            END IF;
        END$$;
        `;
        await sql `
        DO $$
        BEGIN
            IF EXISTS (
                SELECT 1
                FROM pg_enum e
                JOIN pg_type t ON t.oid = e.enumtypid
                WHERE t.typname = 'user_role' AND e.enumlabel = 'jobsseeker'
            ) THEN
                ALTER TYPE user_role RENAME VALUE 'jobsseeker' TO 'jobseeker';
            END IF;
        END$$;
        `;

        await sql`
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE t.typname = 'user_role' AND e.enumlabel = 'recruiter'
    ) THEN
        ALTER TYPE user_role ADD VALUE 'recruiter';
    END IF;
END$$;
`;
        await sql `
        CREATE TABLE IF NOT EXISTS users (
             user_id SERIAL PRIMARY KEY,
             name VARCHAR(255) NOT NULL,
             email VARCHAR(255) UNIQUE NOT NULL,
             password VARCHAR(255) NOT NULL,
             phone_number VARCHAR(20) NOT NULL,
             role user_role NOT NULL,
             bio TEXT,
             resume VARCHAR(255),
             resume_public_id VARCHAR(255),
             profile_pic VARCHAR(255),
             profile_pic_public_id VARCHAR(255),
             created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP NOT NULL,
             subscription TIMESTAMPTZ
    )        `;
        await sql `
        CREATE TABLE IF NOT EXISTS skills(
        skill_id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE)
        `;
        await sql `
        CREATE TABLE IF NOT EXISTS user_skills(
          user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          skill_id INTEGER REFERENCES skills(skill_id) ON DELETE CASCADE,
          PRIMARY KEY (user_id, skill_id)
        )
        `;
        console.log("✅ Database initialized successfully");
    }
    catch (error) {
        console.error("❌ Error initializing database", error);
        process.exit(1);
    }
}
inintDb().then(() => {
    app.listen(process.env.PORT, () => {
        console.log(`Auth server is running on http://localhost:${process.env.PORT}`);
    });
});