from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.linear_model import Ridge
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

DATA_PATH = Path(__file__).parent / 'data' / 'nightly_sleep.csv'
TIMEZONE = 'Asia/Singapore'
MIN_TRAIN = 8


def load_data(path=DATA_PATH):
    df = pd.read_csv(path)
    df['nightDate'] = pd.to_datetime(df['nightDate'])
    for col in ['sleepOnset', 'wakeTime']:
        df[col] = pd.to_datetime(df[col], utc=True).dt.tz_convert(TIMEZONE)
    df = df.sort_values('nightDate').drop_duplicates('nightDate').reset_index(drop=True)
    df['onset_min'] = (df.sleepOnset.dt.hour * 60 + df.sleepOnset.dt.minute + df.sleepOnset.dt.second / 60)
    df['onset_min'] = df['onset_min'].where(df['onset_min'] >= 720, df['onset_min'] + 1440)
    df['wake_min'] = df.wakeTime.dt.hour * 60 + df.wakeTime.dt.minute + df.wakeTime.dt.second / 60
    df['duration_min'] = pd.to_numeric(df.totalSleepMinutes, errors='coerce')
    df = df.dropna(subset=['onset_min', 'wake_min', 'duration_min'])
    df = df[(df.duration_min > 0) & (df.duration_min <= 1440)].copy().reset_index(drop=True)
    return df


def build_examples(df):
    examples = []
    for i in range(1, len(df)):
        current, previous = df.iloc[i], df.iloc[i - 1]
        gap_days = (current.nightDate - previous.nightDate).days
        # The previous observation must be reasonably recent.
        if gap_days > 7:
            continue
        # Calendar features refer to the following morning.
        wake_day = current.nightDate + pd.Timedelta(days=1)
        weekday = wake_day.dayofweek
        features = [
            np.sin(2 * np.pi * weekday / 7),
            np.cos(2 * np.pi * weekday / 7),
            previous.onset_min,
            previous.wake_min,
            previous.duration_min,
            gap_days,
        ]
        targets = [current.onset_min, current.wake_min, current.duration_min]
        examples.append((current.nightDate.strftime('%Y-%m-%d'), features, targets))
    return examples


def evaluate(examples):
    if len(examples) <= MIN_TRAIN:
        print(f'Only {len(examples)} usable examples; need more than {MIN_TRAIN} for walk-forward evaluation.')
        return

    X = np.array([x[1] for x in examples], dtype=float)
    y = np.array([x[2] for x in examples], dtype=float)
    rows = []
    for i in range(MIN_TRAIN, len(examples)):
        X_train, y_train = X[:i], y[:i]
        # Baseline: average of up to the last 3 observed outcomes.
        baseline = y_train[-3:].mean(axis=0)
        model = make_pipeline(StandardScaler(), Ridge(alpha=10.0))
        model.fit(X_train, y_train)
        prediction = model.predict(X[i:i + 1])[0]
        rows.append({
            'date': examples[i][0],
            'actual_onset': y[i, 0],
            'actual_wake': y[i, 1],
            'actual_duration': y[i, 2],
            **{f'baseline_{name}': baseline[j] for j, name in enumerate(['onset', 'wake', 'duration'])},
            **{f'ridge_{name}': prediction[j] for j, name in enumerate(['onset', 'wake', 'duration'])},
        })

    results = pd.DataFrame(rows)
    print(f'\nWalk-forward test nights: {len(results)}')
    print('Mean absolute error (minutes; lower is better):')
    for target in ['onset', 'wake', 'duration']:
        actual = results[f'actual_{target}']
        base_mae = (actual - results[f'baseline_{target}']).abs().mean()
        ridge_mae = (actual - results[f'ridge_{target}']).abs().mean()
        print(f'  {target:8s}  baseline={base_mae:6.1f}  ridge={ridge_mae:6.1f}')
    output = Path(__file__).parent / 'evaluation_results.csv'
    results.to_csv(output, index=False)
    print(f'\nSaved predictions: {output}')


if __name__ == '__main__':
    df = load_data()
    print(f'Loaded {len(df)} valid nights: {df.nightDate.min().date()} to {df.nightDate.max().date()}')
    print(f'Average recorded duration: {df.duration_min.mean() / 60:.2f} hours')
    examples = build_examples(df)
    print(f'Usable supervised examples: {len(examples)}')
    evaluate(examples)
