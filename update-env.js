const fs = require('fs');

async function updateEnv() {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const envVars = [];
  
  for (const line of envContent.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const splitIndex = line.indexOf('=');
    if (splitIndex === -1) continue;
    
    const key = line.substring(0, splitIndex).trim();
    let value = line.substring(splitIndex + 1).trim();
    
    // remove quotes if needed
    if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    
    if (key === 'PORT') continue; // Render handles PORT dynamically
    
    // remove existing key if present to handle duplicates
    const existingIndex = envVars.findIndex(e => e.key === key);
    if (existingIndex !== -1) {
      envVars.splice(existingIndex, 1);
    }
    
    envVars.push({ key, value });
  }

  const res = await fetch('https://api.render.com/v1/services/srv-d88o3mkm0tmc738kubrg/env-vars', {
    method: 'PUT',
    headers: {
      'Authorization': 'Bearer rnd_MZU7Wt9BqipsMK6yDW7YbYMVdtMo',
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(envVars)
  });

  const data = await res.json();
  console.log('Success, env vars set:', data.length);
}

updateEnv().catch(console.error);
