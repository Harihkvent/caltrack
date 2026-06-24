import asyncio
import os
import asyncpg
from dotenv import load_dotenv

async def main():
    load_dotenv()
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("DATABASE_URL not found")
        return

    sql = """
    alter table meals add column if not exists sugar_g numeric(6,1) default 0;
    alter table meals add column if not exists fiber_g numeric(6,1) default 0;
    alter table meals add column if not exists sodium_mg numeric(6,1) default 0;
    """
    print("Altering meals table to add sugar_g, fiber_g, sodium_mg...")
    try:
        conn = await asyncpg.connect(db_url)
        await conn.execute(sql)
        print("Meals table altered successfully!")
        await conn.close()
    except Exception as e:
        print("Alter table failed:", e)

if __name__ == "__main__":
    asyncio.run(main())
