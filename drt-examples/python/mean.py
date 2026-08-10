import json
import numpy as np

def exec(data):
    means = {}
    for column, values in data.items():
        mean_value = np.mean(values) 
        # Round the mean to 6 decimal places
        means[column] = np.round(mean_value, 6)
    return json.dumps(means)