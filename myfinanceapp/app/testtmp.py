from utils import parse_amount

# Test 1: Normal amount
print(parse_amount("1 234,56"))  # Should print: 1234.56

# Test 2: Amount with no spaces
print(parse_amount("1234,56"))  # Should print: 1234.56

try:
    print(parse_amount("-500,00"))
except ValueError as e:
    print(f"Error caught: {e}")  # Should print error message

# Test 4: Allow negative
print(parse_amount("-500,00", allow_negative=True)) 
