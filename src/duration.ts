interface Duration {
  hours?: number;
  minutes?: number;
  seconds?: number;
  milliseconds?: number;
}

const millisecondsPerSecond = 1000;
const secondsPerMinute = 60;
const minutesPerHour = 60;
const millisecondsPerMinute = millisecondsPerSecond * secondsPerMinute;
const millisecondsPerHour = millisecondsPerMinute * minutesPerHour;

export function milliseconds(duration: Duration) {
  return (
    (duration?.hours ?? 0) * millisecondsPerHour +
    (duration.minutes ?? 0) * millisecondsPerMinute +
    (duration.seconds ?? 0) * millisecondsPerSecond +
    (duration.milliseconds ?? 0)
  );
}
