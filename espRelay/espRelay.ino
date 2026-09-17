const int RELAY_PIN = 4; // Update this to match your relay's pin number

void setup() {
  pinMode(RELAY_PIN, OUTPUT);
}

void loop() {
  digitalWrite(RELAY_PIN, HIGH);
  delay(5000); // Wait for 5 seconds
  
  digitalWrite(RELAY_PIN, LOW);
  delay(5000); // Wait for 5 seconds
}
