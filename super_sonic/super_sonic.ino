
// model: HC-SR04
// Define the pins based on your request
const int trigPin = 18; // TX
const int echoPin = 5;  // RX

// Variables for the duration of the sound wave and the calculated distance
long duration;
float distanceCm;

void setup() {
  // Start the Serial Monitor at a baud rate of 115200
  Serial.begin(115200);
  
  // Set the Trig pin as an Output (to send the signal)
  pinMode(trigPin, OUTPUT);
  
  // Set the Echo pin as an Input (to receive the signal)
  pinMode(echoPin, INPUT);
}

void loop() {
  // 1. Clear the trigPin to ensure a clean pulse
  digitalWrite(trigPin, LOW);
  delayMicroseconds(2);
  
  // 2. Send a 10-microsecond HIGH pulse to trigger the sensor
  digitalWrite(trigPin, HIGH);
  delayMicroseconds(10);
  digitalWrite(trigPin, LOW);
  
  // 3. Read the echoPin. pulseIn() returns the time (in microseconds) the pin was HIGH
  duration = pulseIn(echoPin, HIGH);
  
  // 4. Calculate the distance
  // Speed of sound is ~343 meters per second, or 0.0343 cm per microsecond.
  // We divide by 2 because the sound wave travels out AND back.
  distanceCm = duration * 0.0343 / 2;
  
  // 5. Print the result to the Serial Monitor
  Serial.print("Distance: ");
  Serial.print(distanceCm);
  Serial.println(" cm");
  
  // Wait half a second before taking the next reading
  delay(500);
}
