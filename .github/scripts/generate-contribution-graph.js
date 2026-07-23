#!/usr/bin/env node

/**
 * Generate Contribution Graph SVGs - Individual + Combined
 * 
 * Creates 4 SVG visualizations:
 * 1. Individual graph for syedasadabbas (Red)
 * 2. Individual graph for syedprog (Orange)
 * 3. Individual graph for syedprogg (Gold)
 * 4. Combined graph (All 3 accounts)
 * 
 * Each graph scales based on actual data with clear numbers visible
 */

const https = require('https');
const fs = require('fs');

const ACCOUNTS = ['syedasadabbas', 'syedprog', 'syedprogg'];
const GH_TOKEN = process.env.GH_TOKEN;

// Account colors
const ACCOUNT_COLORS = {
  syedasadabbas: { color: '#FF6B6B', name: 'Primary Account' },
  syedprog: { color: '#FFA500', name: 'Research & Work' },
  syedprogg: { color: '#FFD700', name: 'Learning Projects' },
};

if (!GH_TOKEN) {
  console.error('Error: GH_TOKEN environment variable is required');
  process.exit(1);
}

/**
 * GraphQL query to fetch all commits for a user
 */
function getCommitsQuery(username) {
  return `
    query {
      user(login: "${username}") {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                contributionCount
                date
              }
            }
          }
        }
        repositories(first: 100) {
          totalCount
        }
      }
    }
  `;
}

/**
 * Make GitHub GraphQL request
 */
function githubGraphQLQuery(query) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ query });

    const options = {
      hostname: 'api.github.com',
      path: '/graphql',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GH_TOKEN}`,
        'Content-Type': 'application/json',
        'Content-Length': data.length,
        'User-Agent': 'GitHub-Graph-Generator',
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.errors) {
            reject(new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`));
          } else {
            resolve(response.data);
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * Fetch contribution data for all accounts
 */
async function fetchAllContributions() {
  const results = {};

  for (const account of ACCOUNTS) {
    console.log(`Fetching data for ${account}...`);
    try {
      const query = getCommitsQuery(account);
      const data = await githubGraphQLQuery(query);
      
      const contributions = data.user.contributionsCollection.contributionCalendar.weeks;
      const totalContributions = data.user.contributionsCollection.contributionCalendar.totalContributions;
      
      // Aggregate by weeks
      const weeklyData = [];
      contributions.forEach(week => {
        let weekTotal = 0;
        week.contributionDays.forEach(day => {
          weekTotal += day.contributionCount;
        });
        weeklyData.push(weekTotal);
      });

      results[account] = {
        weeklyData,
        totalContributions,
        repositoriesCount: data.user.repositories.totalCount,
      };
      
      console.log(`  ✓ ${account}: ${totalContributions} total contributions`);
    } catch (error) {
      console.error(`  ✗ Failed to fetch ${account}:`, error.message);
      results[account] = {
        weeklyData: new Array(104).fill(0),
        totalContributions: 0,
        repositoriesCount: 0,
      };
    }
  }

  return results;
}

/**
 * Generate individual SVG for an account
 */
function generateIndividualSVG(account, weeklyData, totalContributions, color) {
  const width = 1200;
  const height = 500;
  const padding = { top: 60, right: 40, bottom: 80, left: 100 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Calculate proper vertical scale based on data
  const maxValue = Math.max(...weeklyData, 1);
  const yStep = Math.ceil(maxValue / 10);
  const yMax = Math.ceil(maxValue / yStep) * yStep;

  const weekCount = weeklyData.length;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      .title { font-size: 22px; font-weight: bold; fill: ${color}; }
      .subtitle { font-size: 14px; fill: #8b949e; }
      .axis-label { font-size: 13px; fill: #8b949e; font-weight: 500; }
      .value-label { font-size: 11px; fill: #c9d1d9; font-weight: bold; }
      .grid-line { stroke: #30363d; stroke-width: 1; stroke-dasharray: 2,2; }
      .axis-line { stroke: #30363d; stroke-width: 2; }
      .line { stroke-width: 3; fill: none; stroke-linejoin: round; stroke-linecap: round; }
      .point { fill: ${color}; filter: drop-shadow(0 0 3px rgba(0,0,0,0.5)); }
      .bg { fill: #0d1117; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" class="bg"/>

  <!-- Title -->
  <text x="${width / 2}" y="35" class="title" text-anchor="middle">📊 ${ACCOUNT_COLORS[account].name} (@${account})</text>
  <text x="${width / 2}" y="55" class="subtitle" text-anchor="middle">All-Time Weekly Contribution Data | Total: ${totalContributions} commits</text>

  <!-- Grid lines and Y-axis labels -->`;

  // Y-axis grid lines
  for (let i = 0; i <= yMax; i += yStep) {
    const y = padding.top + plotHeight - (i / yMax) * plotHeight;
    svg += `\n  <line x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}" class="grid-line"/>`;
    svg += `\n  <text x="${padding.left - 10}" y="${y + 5}" class="axis-label" text-anchor="end">${i}</text>`;
  }

  // X-axis (weeks)
  for (let i = 0; i < weekCount; i += 4) {
    const x = padding.left + (i / weekCount) * plotWidth;
    svg += `\n  <line x1="${x}" y1="${padding.top + plotHeight}" x2="${x}" y2="${padding.top + plotHeight + 5}" class="grid-line"/>`;
    if (i % 8 === 0) {
      const weekNum = Math.floor(i / 4) * 4;
      svg += `\n  <text x="${x}" y="${padding.top + plotHeight + 25}" class="axis-label" text-anchor="middle">W${weekNum}</text>`;
    }
  }

  // Create path for the line
  let pathData = '';
  for (let i = 0; i < weeklyData.length; i++) {
    const x = padding.left + (i / weekCount) * plotWidth;
    const y = padding.top + plotHeight - (weeklyData[i] / yMax) * plotHeight;
    pathData += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
  }

  // Draw line
  svg += `\n  <path d="${pathData}" class="line" stroke="${color}"/>`;

  // Draw points with values
  weeklyData.forEach((val, i) => {
    const x = padding.left + (i / weekCount) * plotWidth;
    const y = padding.top + plotHeight - (val / yMax) * plotHeight;
    
    svg += `\n  <circle cx="${x}" cy="${y}" r="5" class="point"/>`;
    
    // Show value for peaks and significant points
    if (val > 0 && (val === maxValue || i % 8 === 0 || val > yMax * 0.6)) {
      svg += `\n  <text x="${x}" y="${y - 12}" class="value-label" text-anchor="middle">${val}</text>`;
    }
  });

  // Axes
  svg += `\n  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" class="axis-line"/>`;
  svg += `\n  <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${padding.left + plotWidth}" y2="${padding.top + plotHeight}" class="axis-line"/>`;

  // Axis labels
  svg += `\n  <text x="30" y="${padding.top + plotHeight / 2}" class="axis-label" text-anchor="middle" transform="rotate(-90 30 ${padding.top + plotHeight / 2})">Commits per Week (${yStep}-point scale)</text>`;
  svg += `\n  <text x="${padding.left + plotWidth / 2}" y="${height - 15}" class="axis-label" text-anchor="middle">Time Period (Weekly Intervals - 7 days)</text>`;

  // Info box
  svg += `\n  <rect x="${padding.left}" y="${padding.top + plotHeight + 50}" width="350" height="60" fill="#161b22" stroke="#30363d" stroke-width="1" rx="4"/>`;
  svg += `\n  <text x="${padding.left + 10}" y="${padding.top + plotHeight + 70}" class="subtitle" font-size="12">📊 Statistics</text>`;
  svg += `\n  <text x="${padding.left + 10}" y="${padding.top + plotHeight + 85}" class="value-label" font-size="11">Total Commits: ${totalContributions} | Weeks of Data: ${weekCount} | Avg/Week: ${Math.round(totalContributions / weekCount)}</text>`;

  // Timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  svg += `\n  <text x="${width - 10}" y="${height - 10}" class="axis-label" text-anchor="end" font-size="11">Generated: ${timestamp}</text>`;

  svg += `\n</svg>`;
  return svg;
}

/**
 * Generate combined SVG
 */
function generateCombinedSVG(data) {
  const width = 1200;
  const height = 500;
  const padding = { top: 60, right: 40, bottom: 80, left: 100 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Calculate combined data and max
  const weekCount = data[ACCOUNTS[0]].weeklyData.length;
  const combinedData = new Array(weekCount).fill(0);
  
  Object.entries(data).forEach(([account, accountData]) => {
    accountData.weeklyData.forEach((val, idx) => {
      combinedData[idx] += val;
    });
  });

  const maxValue = Math.max(...combinedData, 1);
  const yStep = Math.ceil(maxValue / 10);
  const yMax = Math.ceil(maxValue / yStep) * yStep;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      .title { font-size: 22px; font-weight: bold; fill: #00d4ff; }
      .subtitle { font-size: 14px; fill: #8b949e; }
      .axis-label { font-size: 13px; fill: #8b949e; font-weight: 500; }
      .value-label { font-size: 11px; fill: #c9d1d9; font-weight: bold; }
      .grid-line { stroke: #30363d; stroke-width: 1; stroke-dasharray: 2,2; }
      .axis-line { stroke: #30363d; stroke-width: 2; }
      .line { stroke-width: 2; fill: none; stroke-linejoin: round; stroke-linecap: round; opacity: 0.8; }
      .point { filter: drop-shadow(0 0 3px rgba(0,0,0,0.5)); }
      .bg { fill: #0d1117; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" class="bg"/>

  <!-- Title -->
  <text x="${width / 2}" y="35" class="title" text-anchor="middle">📊 Combined Contribution Graph (All 3 Accounts)</text>
  <text x="${width / 2}" y="55" class="subtitle" text-anchor="middle">All-Time Weekly Combined Data | Total: ${data[ACCOUNTS[0]].totalContributions + data[ACCOUNTS[1]].totalContributions + data[ACCOUNTS[2]].totalContributions} commits</text>

  <!-- Grid lines and Y-axis labels -->`;

  // Y-axis grid lines
  for (let i = 0; i <= yMax; i += yStep) {
    const y = padding.top + plotHeight - (i / yMax) * plotHeight;
    svg += `\n  <line x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}" class="grid-line"/>`;
    svg += `\n  <text x="${padding.left - 10}" y="${y + 5}" class="axis-label" text-anchor="end">${i}</text>`;
  }

  // X-axis (weeks)
  for (let i = 0; i < weekCount; i += 4) {
    const x = padding.left + (i / weekCount) * plotWidth;
    svg += `\n  <line x1="${x}" y1="${padding.top + plotHeight}" x2="${x}" y2="${padding.top + plotHeight + 5}" class="grid-line"/>`;
    if (i % 8 === 0) {
      const weekNum = Math.floor(i / 4) * 4;
      svg += `\n  <text x="${x}" y="${padding.top + plotHeight + 25}" class="axis-label" text-anchor="middle">W${weekNum}</text>`;
    }
  }

  // Draw all 3 lines
  Object.entries(data).forEach(([account, accountData]) => {
    let pathData = '';
    for (let i = 0; i < accountData.weeklyData.length; i++) {
      const x = padding.left + (i / weekCount) * plotWidth;
      const y = padding.top + plotHeight - (accountData.weeklyData[i] / yMax) * plotHeight;
      pathData += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
    }

    const color = ACCOUNT_COLORS[account].color;
    svg += `\n  <path d="${pathData}" class="line" stroke="${color}"/>`;

    // Draw points
    accountData.weeklyData.forEach((val, i) => {
      const x = padding.left + (i / weekCount) * plotWidth;
      const y = padding.top + plotHeight - (val / yMax) * plotHeight;
      svg += `\n  <circle cx="${x}" cy="${y}" r="3" class="point" fill="${color}"/>`;
    });
  });

  // Draw combined line (thicker)
  let combinedPath = '';
  for (let i = 0; i < combinedData.length; i++) {
    const x = padding.left + (i / weekCount) * plotWidth;
    const y = padding.top + plotHeight - (combinedData[i] / yMax) * plotHeight;
    combinedPath += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
  }
  svg += `\n  <path d="${combinedPath}" stroke="#00d4ff" stroke-width="3" fill="none" stroke-linejoin="round" stroke-linecap="round"/>`;

  // Draw combined points
  combinedData.forEach((val, i) => {
    const x = padding.left + (i / weekCount) * plotWidth;
    const y = padding.top + plotHeight - (val / yMax) * plotHeight;
    svg += `\n  <circle cx="${x}" cy="${y}" r="4" fill="#00d4ff" class="point"/>`;
    
    // Show values for significant points
    if (val > 0 && (val === maxValue || i % 8 === 0 || val > yMax * 0.6)) {
      svg += `\n  <text x="${x}" y="${y - 12}" class="value-label" text-anchor="middle" fill="#00d4ff">${val}</text>`;
    }
  });

  // Axes
  svg += `\n  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" class="axis-line"/>`;
  svg += `\n  <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${padding.left + plotWidth}" y2="${padding.top + plotHeight}" class="axis-line"/>`;

  // Axis labels
  svg += `\n  <text x="30" y="${padding.top + plotHeight / 2}" class="axis-label" text-anchor="middle" transform="rotate(-90 30 ${padding.top + plotHeight / 2})">Combined Commits per Week (${yStep}-point scale)</text>`;
  svg += `\n  <text x="${padding.left + plotWidth / 2}" y="${height - 15}" class="axis-label" text-anchor="middle">Time Period (Weekly Intervals - 7 days)</text>`;

  // Legend
  const legendY = padding.top + plotHeight + 50;
  const legendItems = [
    { label: 'syedasadabbas (Primary)', color: ACCOUNT_COLORS.syedasadabbas.color },
    { label: 'syedprog (Research)', color: ACCOUNT_COLORS.syedprog.color },
    { label: 'syedprogg (Learning)', color: ACCOUNT_COLORS.syedprogg.color },
    { label: 'Combined Total', color: '#00d4ff' },
  ];

  let legendX = padding.left;
  legendItems.forEach(item => {
    svg += `\n  <circle cx="${legendX}" cy="${legendY}" r="5" fill="${item.color}"/>`;
    svg += `\n  <text x="${legendX + 12}" y="${legendY + 4}" class="axis-label" font-size="12">${item.label}</text>`;
    legendX += 280;
  });

  // Timestamp
  const timestamp = new Date().toISOString().split('T')[0];
  svg += `\n  <text x="${width - 10}" y="${height - 10}" class="axis-label" text-anchor="end" font-size="11">Generated: ${timestamp}</text>`;

  svg += `\n</svg>`;
  return svg;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('\n📊 Generating All-Time Contribution Graphs...\n');
    
    const data = await fetchAllContributions();

    // Generate individual graphs
    for (const account of ACCOUNTS) {
      const svg = generateIndividualSVG(
        account,
        data[account].weeklyData,
        data[account].totalContributions,
        ACCOUNT_COLORS[account].color
      );
      const filename = `CONTRIBUTION_GRAPH_${account.toUpperCase()}.svg`;
      fs.writeFileSync(filename, svg, 'utf-8');
      console.log(`✅ Generated ${filename}`);
    }

    // Generate combined graph
    const combinedSvg = generateCombinedSVG(data);
    fs.writeFileSync('CONTRIBUTION_GRAPH.svg', combinedSvg, 'utf-8');
    console.log(`✅ Generated CONTRIBUTION_GRAPH.svg`);

    console.log(`\n📊 Graph Generation Complete!\n`);
    console.log(`Files created:`);
    console.log(`  - CONTRIBUTION_GRAPH_SYEDASADABBAS.svg (Primary Account)`);
    console.log(`  - CONTRIBUTION_GRAPH_SYEDPROG.svg (Research & Work)`);
    console.log(`  - CONTRIBUTION_GRAPH_SYEDPROGG.svg (Learning Projects)`);
    console.log(`  - CONTRIBUTION_GRAPH.svg (Combined All 3)`);
    console.log(`\nAccount Summary:`);
    Object.entries(data).forEach(([account, accountData]) => {
      console.log(`  ${account}: ${accountData.totalContributions} commits, ${accountData.repositoriesCount} repos`);
    });
  } catch (error) {
    console.error('❌ Error generating graphs:', error.message);
    process.exit(1);
  }
}

main();
