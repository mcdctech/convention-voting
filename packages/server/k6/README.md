# k6 Load Testing for MCDC Convention Voting

Load testing scripts for testing the voting system at https://win.mcdems.us

## Quick Start

### 1. Set Up the Droplet

SSH into your DigitalOcean droplet:

```bash
ssh root@YOUR_DROPLET_IP
```

Install k6:

```bash
# Add k6 repository
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6 -y
```

Create a directory for the tests:

```bash
mkdir -p ~/k6-tests
cd ~/k6-tests
```

### 2. Copy Test Files to Droplet

From your local machine, copy the test files:

```bash
scp packages/server/k6/*.js root@YOUR_DROPLET_IP:~/k6-tests/
```

Or create the files manually on the droplet using the content from this repository.

### 3. Create Test Data in Production

Before running the voting simulation, you need to create test data:

1. **Create 1000 test voter accounts**
   - Username pattern: `loadtest1` through `loadtest1000`
   - All with the same password (e.g., `LoadTest2024!`)
   - You can create a CSV file and bulk upload via the admin panel

2. **Create a test voting pool**
   - Name it something like "Load Test Pool"
   - Add all 1000 test voters to this pool

3. **Create a test meeting**
   - Use the test pool as the quorum pool

4. **Create a test motion**
   - Add 3-4 choices (e.g., "Option A", "Option B", "Option C", "Abstain")
   - Note the **Motion ID** from the URL

5. **Start voting on the motion**
   - The motion must be in "voting_active" status

### 4. Run the Tests

#### Health Check (Run First)

Validates connectivity to the server:

```bash
cd ~/k6-tests
k6 run health-check.js
```

Expected output: All checks should pass, response times < 200ms.

#### Voting Simulation

Run the full voting simulation (5 minutes, bell curve distribution):

```bash
k6 run \
  -e VOTER_PASSWORD="LoadTest2024!" \
  -e MOTION_ID=123 \
  voting-simulation.js
```

With JSON output for detailed analysis:

```bash
k6 run \
  -e VOTER_PASSWORD="LoadTest2024!" \
  -e MOTION_ID=123 \
  --out json=results.json \
  voting-simulation.js
```

### 5. Environment Variables

| Variable         | Default                 | Description                  |
| ---------------- | ----------------------- | ---------------------------- |
| `BASE_URL`       | `https://win.mcdems.us` | Target server URL            |
| `VOTER_PASSWORD` | (required)              | Password for all test voters |
| `VOTER_PREFIX`   | `loadtest`              | Username prefix              |
| `VOTER_COUNT`    | `1000`                  | Number of test voters        |
| `MOTION_ID`      | (required)              | ID of the motion to vote on  |

### 6. Understanding the Results

#### Console Summary

After each test, you'll see a summary including:

- **Votes Successful**: Number of votes successfully cast
- **Already Voted**: Expected after first iteration (each voter can only vote once)
- **Vote Duration (p95)**: 95th percentile - 95% of votes completed faster than this
- **HTTP Duration (p95)**: Overall request performance
- **Vote Success Rate**: Should be > 95%

#### JSON Output

The JSON file contains detailed metrics for every request. Key sections:

- `metrics.http_req_duration`: Response time statistics
- `metrics.votes_successful`: Successful vote count
- `metrics.vote_duration`: Vote-specific timing

### 7. Test Scenarios

#### Quick Smoke Test (2 minutes)

Validates everything works with minimal load:

```bash
k6 run \
  -e VOTER_PASSWORD="LoadTest2024!" \
  -e MOTION_ID=123 \
  --duration 2m \
  --vus 10 \
  voting-simulation.js
```

#### Full Load Test (5 minutes, bell curve)

Default configuration - simulates realistic convention voting:

```bash
k6 run \
  -e VOTER_PASSWORD="LoadTest2024!" \
  -e MOTION_ID=123 \
  voting-simulation.js
```

#### Stress Test (higher concurrency)

Push beyond normal limits:

```bash
k6 run \
  -e VOTER_PASSWORD="LoadTest2024!" \
  -e MOTION_ID=123 \
  --stage 1m:100,2m:500,2m:800,2m:500,1m:100 \
  voting-simulation.js
```

### 8. Cleanup

After testing:

1. **End voting** on the test motion
2. **Delete the test motion** (or keep for historical records)
3. **Optionally disable test voters** if you want to keep them for future tests
4. **Destroy the droplet** to stop charges:
   ```bash
   # From DigitalOcean dashboard or:
   doctl compute droplet delete YOUR_DROPLET_ID
   ```

### 9. Troubleshooting

**Login failures**:

- Verify the password is correct
- Check that test voters exist and are not disabled
- Ensure login is enabled in system settings

**Vote failures**:

- Confirm the motion is in "voting_active" status
- Verify test voters are in the motion's voting pool
- Check that the motion has choices

**High response times**:

- Could indicate database bottleneck
- Check server resources in DigitalOcean dashboard
- Consider scaling the app or database

**Connection errors**:

- Verify the droplet can reach `win.mcdems.us`
- Check if rate limiting is active
- Try `curl https://win.mcdems.us/health` from the droplet
