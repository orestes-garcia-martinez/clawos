curl -X POST http://localhost:3002/run/careerclaw \
  -H "Content-Type: application/json" \
  -H "x-worker-secret: <WORKER_SECRET>" \
  -d '{
    "userId": "00000000-0000-0000-0000-000000000001",
    "profile": {
      "targetRoles": ["Senior Software Engineer"],
      "skills": ["TypeScript", "React", "Node.js"],
      "experienceYears": 10,
      "workMode": "remote",
      "salaryMin": 140000,
      "resumeSummary": "Senior Software Engineer with 10 years TypeScript and React experience."
    },
    "resumeText": "Senior Software Engineer with 10 years TypeScript and React experience.",
    "topK": 3
  }'