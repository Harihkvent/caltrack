import asyncio
from dotenv import load_dotenv
load_dotenv()

from app.services.estimator import EstimatorService

async def test():
    estimator = EstimatorService()
    
    print("Testing exercise estimation...")
    exercise_input = "ran 5 miles in 45 minutes"
    result, raw = await estimator.estimate("text", exercise_input, None)
    print("Type classified:", result.type)
    print("Exercise Data:", result.exercise_data)
    
    print("\nTesting food/meal estimation...")
    meal_input = "2 boiled eggs and black coffee"
    result, raw = await estimator.estimate("text", meal_input, None)
    print("Type classified:", result.type)
    print("Meal Data (first few food items):", [f.name for f in result.meal_data.food_items])
    print("Meal Calories:", result.meal_data.calories)

if __name__ == "__main__":
    asyncio.run(test())
