import asyncio
import os
import asyncpg
from dotenv import load_dotenv

async def main():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found in .env")
        return

    migration_file = "migrations/003_exercises.sql"
    if not os.path.exists(migration_file):
        print(f"Migration file {migration_file} not found")
        return

    with open(migration_file, "r") as f:
        sql = f.read()

    print(f"Running migration from {migration_file}...")
    try:
        conn = await asyncpg.connect(db_url)
        await conn.execute(sql)
        print("Migration applied successfully!")
        await conn.close()
    except Exception as e:
        print("Migration failed:", e)

if __name__ == "__main__":
    asyncio.run(main())
