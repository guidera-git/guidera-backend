import sys
import json
import joblib
import numpy as np
import pandas as pd

# Load model and encoders
model = joblib.load("degree_predictor.pkl")
feature_encoders = joblib.load("label_encoders.pkl")      # For encoding features like 'Study Stream'
target_encoder = joblib.load("target_encoder.pkl")        # For decoding predicted degree

def recommend_degree_inline(inputs, top_k=1):
    df = pd.DataFrame([inputs])

    # Encode categorical features using encoders
    for col in feature_encoders:
        encoder = feature_encoders[col]
        df[col] = encoder.transform(df[col])

    # Predict probabilities
    probs = model.predict_proba(df)[0]

    # Get top prediction
    top_idx = np.argsort(probs)[::-1][:top_k]
    top_degrees = target_encoder.inverse_transform(top_idx)
    top_scores = probs[top_idx]

    return top_degrees[0], float(top_scores[0])

def main():
    try:
        input_str = sys.stdin.read()
        data = json.loads(input_str)

        deg, score = recommend_degree_inline(data, top_k=1)

        print(json.dumps({
        "predicted_degree": str(deg),
        "confidence_score": float(score)
        }), flush=True)

    except Exception as e:
        print(json.dumps({"error": str(e)}), flush=True)

if __name__ == "__main__":
    main()





#     Get-Content .\test.json | python .\predictor.py

# '{"Gender":0,"Academic Percentage":55.0,"Study Stream":"Computer Science","Analytical":5,"Logical":5,"Explaining":5,"Creative":1,"Detail-Oriented":5,"Helping":5,"Activity Preference":2,"Project Preference":1}' |   python .\predictor.py

