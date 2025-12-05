import re
from typing import Dict, List, Optional, Tuple
import joblib
from pathlib import Path

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.naive_bayes import MultinomialNB
    from sklearn.pipeline import Pipeline
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False


class TransactionCategorizer:
    """Auto-categorize transactions using ML."""

    def __init__(self, model_path: str = "data/categorizer_model.pkl"):
        self.model_path = Path(model_path)
        self.model = None
        self.type_mapping = {}
        self.subtype_mapping = {}

        if ML_AVAILABLE and self.model_path.exists():
            self.load_model()

    def preprocess_text(self, text: str) -> str:
        """Clean and preprocess transaction description."""
        # Lowercase
        text = text.lower()
        # Remove special characters but keep spaces
        text = re.sub(r'[^a-z0-9äöüß\s]', ' ', text)
        # Remove extra spaces
        text = ' '.join(text.split())
        return text

    def train_model(self, transactions: List[Dict]):
        """Train the categorization model on historical transactions."""
        if not ML_AVAILABLE:
            raise ImportError("scikit-learn not installed")

        if len(transactions) < 10:
            raise ValueError("Need at least 10 transactions to train model")

        # Prepare training data
        X = []
        y = []

        for txn in transactions:
            if txn.get('type_id') and txn.get('description'):
                X.append(self.preprocess_text(txn['description']))
                # Create composite label: type_id:subtype_id
                label = f"{txn['type_id']}:{txn.get('subtype_id', 0)}"
                y.append(label)

        if len(set(y)) < 2:
            raise ValueError("Need at least 2 different categories to train")

        # Build pipeline
        self.model = Pipeline([
            ('tfidf', TfidfVectorizer(
                max_features=1000,
                ngram_range=(1, 2),
                min_df=2
            )),
            ('clf', MultinomialNB(alpha=0.1))
        ])

        # Train
        self.model.fit(X, y)

        # Save model
        self.save_model()

        return len(X), len(set(y))

    def predict(self, description: str) -> Tuple[Optional[int], Optional[int], float]:
        """
        Predict category for a transaction description.
        Returns: (type_id, subtype_id, confidence)
        """
        if not self.model:
            return None, None, 0.0

        processed = self.preprocess_text(description)
        prediction = self.model.predict([processed])[0]
        probabilities = self.model.predict_proba([processed])[0]
        confidence = max(probabilities)

        # Parse prediction
        parts = prediction.split(':')
        type_id = int(parts[0])
        subtype_id = int(parts[1]) if len(parts) > 1 and parts[1] != '0' else None

        return type_id, subtype_id, confidence

    def suggest_categories(self, description: str, top_n: int = 3) -> List[Dict]:
        """Get top N category suggestions with confidence scores."""
        if not self.model:
            return []

        processed = self.preprocess_text(description)
        probabilities = self.model.predict_proba([processed])[0]
        classes = self.model.classes_

        # Sort by probability
        suggestions = []
        sorted_indices = probabilities.argsort()[::-1][:top_n]

        for idx in sorted_indices:
            parts = classes[idx].split(':')
            suggestions.append({
                'type_id': int(parts[0]),
                'subtype_id': int(parts[1]) if len(parts) > 1 and parts[1] != '0' else None,
                'confidence': float(probabilities[idx])
            })

        return suggestions

    def save_model(self):
        """Save trained model to disk."""
        if self.model:
            joblib.dump(self.model, self.model_path)

    def load_model(self):
        """Load trained model from disk."""
        if self.model_path.exists():
            self.model = joblib.load(self.model_path)

    def get_model_info(self) -> Dict:
        """Get information about the trained model."""
        if not self.model:
            return {'trained': False}

        return {
            'trained': True,
            'n_features': self.model.named_steps['tfidf'].max_features,
            'n_classes': len(self.model.classes_),
            'classes': list(self.model.classes_)
        }