import json
import numpy as np

def exec(data):
    medians = {}
    for column, values in data.items():
        median_value = np.median(values)
        # Round the median to 6 decimal places
        medians[column] = np.round(median_value, 6)
    return json.dumps(medians)
