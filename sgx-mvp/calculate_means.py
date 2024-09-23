import sys
import json
import numpy as np

def calculate_mean_of_columns(data):
    """
    Calculate the mean of each column in the given data and round to 6 decimals.
    
    :param data: Dictionary where each key is a column name, and each value is a list of numbers.
    :return: Dictionary with the mean of each column, rounded to 6 decimals.
    """
    means = {}
    for column, values in data.items():
        mean_value = np.mean(values) 
        # Round the mean to 6 decimal places
        means[column] = np.round(mean_value, 6)
    return means

if __name__ == "__main__":
    # Read JSON data from stdin
    input_data = sys.stdin.read()
    test_data = json.loads(input_data)
    
    # Calculate means
    result = calculate_mean_of_columns(test_data)

    # Output the result as JSON
    print(json.dumps(result, indent=4))
