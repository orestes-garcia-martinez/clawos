SECRET=$(grep '^WORKER_SECRET=' ~/clawos/apps/worker/.env | cut -d= -f2)

curl -s -X POST http://localhost:3002/run/careerclaw \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: $SECRET" \
  -d '{
    "userId": "00000000-0000-0000-0000-000000000001",
    "profile": {
      "name": "Test User",
      "targetRoles": ["Senior Software Engineer"],
      "skills": ["TypeScript", "React", "Node.js"],
      "experienceYears": 10,
      "workMode": "remote",
      "salaryMin": 140000,
      "resumeSummary": "Senior Software Engineer with 10 years TypeScript and React experience."
    },
    "resumeText": "Senior Software Engineer with 10 years TypeScript and React experience.",
    "topK": 3
  }' | jq .