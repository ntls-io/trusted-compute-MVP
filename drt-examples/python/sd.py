import json
import numpy as np

def exec(data):
    std_devs = {}
    for column, values in data.items():
        std_dev_value = np.std(values)
        # Round the standard deviation to 6 decimal places
        std_devs[column] = np.round(std_dev_value, 6)
    return json.dumps(std_devs)
