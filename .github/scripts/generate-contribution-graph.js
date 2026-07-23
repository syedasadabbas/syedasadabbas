#!/usr/bin/env node

/**
 * Generate Contribution Graph SVGs - GitHub Compatible
 * 
 * Creates 4 SVG visualizations with GitHub-compatible rendering:
 * 1. Individual graph for syedasadabbas (Red)
 * 2. Individual graph for syedprog (Orange)
 * 3. Individual graph for syedprogg (Gold)
 * 4. Combined graph (All 3 accounts)
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
  console.error('❌ Error: GH_TOKEN environment variable is required');
  process.exit(1);
}

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

function githubGraphQLQuery(query, retries = 3) {
  return new Promise((resolve, reject) => {
    let attempts = 0;

    const attemptRequest = () => {
      attempts++;
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
        timeout: 10000,
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.errors) {
              if (attempts < retries) {
                setTimeout(attemptRequest, 2000);
              } else {
                reject(new Error(`GraphQL Error: ${JSON.stringify(response.errors)}`));
              }
            } else {
              resolve(response.data);
            }
          } catch (err) {
            reject(err);
          }
        });
      });

      req.on('error', (err) => {
        if (attempts < retries) {
          setTimeout(attemptRequest, 2000);
        } else {
          reject(err);
        }
      });

      req.on('timeout', () => {
        req.abort();
        if (attempts < retries) {
          setTimeout(attemptRequest, 2000);
        } else {
          reject(new Error('Request timeout'));
        }
      });

      req.write(data);
      req.end();
    };

    attemptRequest();
  });
}

async function fetchAccountData(account) {
  console.log(`  📡 Fetching data for ${account}...`);
  try {
    const query = getCommitsQuery(account);
    const data = await githubGraphQLQuery(query);
    
    if (!data || !data.user) {
      throw new Error('Invalid response: user not found');
    }

    const contributions = data.user.contributionsCollection.contributionCalendar.weeks;
    const totalContributions = data.user.contributionsCollection.contributionCalendar.totalContributions;
    
    const weeklyData = [];
    contributions.forEach(week => {
      let weekTotal = 0;
      week.contributionDays.forEach(day => {
        weekTotal += day.contributionCount;
      });
      weeklyData.push(weekTotal);
    });

    console.log(`  ✅ ${account}: ${totalContributions} commits, ${data.user.repositories.totalCount} repos`);
    
    return {
      weeklyData,
      totalContributions,
      repositoriesCount: data.user.repositories.totalCount,
      error: null,
    };
  } catch (error) {
    console.error(`  ❌ Failed to fetch ${account}: ${error.message}`);
    return {
      weeklyData: new Array(104).fill(0),
      totalContributions: 0,
      repositoriesCount: 0,
      error: error.message,
    };
  }
}

async function fetchAllContributions() {
  const results = {};
  for (const account of ACCOUNTS) {
    results[account] = await fetchAccountData(account);
  }
  return results;
}

/**
 * Generate GitHub-compatible SVG
 */
function generateIndividualSVG(account, weeklyData, totalContributions, color) {
  const width = 1000;
  const height = 400;
  const padding = { top: 40, right: 20, bottom: 60, left: 80 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const maxValue = Math.max(...weeklyData, 1);
  const yStep = Math.ceil(maxValue / 5); // Fewer grid lines
  const yMax = Math.ceil(maxValue / yStep) * yStep;
  const weekCount = weeklyData.length;

  // Start SVG
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .title { font-size: 18px; font-weight: bold; fill: ${color}; }
  .label { font-size: 11px; fill: #666; }
  .value { font-size: 10px; fill: #333; font-weight: bold; }
  .grid { stroke: #eee; stroke-width: 0.5; }
  .line { stroke: ${color}; stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
  .point { fill: ${color}; }
</style>

<!-- Background -->
<rect width="${width}" height="${height}" fill="white"/>

<!-- Title -->
<text x="${width/2}" y="25" class="title" text-anchor="middle">${ACCOUNT_COLORS[account].name}</text>
<text x="${width/2}" y="37" class="label" text-anchor="middle">Total: ${totalContributions} commits</text>
`;

  // Y-axis grid lines and labels
  for (let i = 0; i <= yMax; i += yStep) {
    const y = padding.top + plotHeight - (i / yMax) * plotHeight;
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="grid"/>`;
    svg += `<text x="${padding.left - 5}" y="${y + 3}" class="label" text-anchor="end">${i}</text>`;
  }

  // X-axis label
  svg += `<text x="${padding.left + plotWidth/2}" y="${height - 5}" class="label" text-anchor="middle">Weeks (all-time)</text>`;

  // Create line path
  let pathData = '';
  for (let i = 0; i < weeklyData.length; i++) {
    const x = padding.left + (i / weekCount) * plotWidth;
    const y = padding.top + plotHeight - (weeklyData[i] / yMax) * plotHeight;
    pathData += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }

  svg += `<path d="${pathData}" class="line"/>`;

  // Points and values
  weeklyData.forEach((val, i) => {
    const x = padding.left + (i / weekCount) * plotWidth;
    const y = padding.top + plotHeight - (val / yMax) * plotHeight;
    
    svg += `<circle cx="${x}" cy="${y}" r="2" class="point"/>`;
    
    if (val > 0 && (val === maxValue || i % 13 === 0)) {
      svg += `<text x="${x}" y="${y - 8}" class="value" text-anchor="middle">${val}</text>`;
    }
  });

  // Axes
  svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" stroke="#333" stroke-width="1"/>`;
  svg += `<line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#333" stroke-width="1"/>`;

  svg += `</svg>`;
  return svg;
}

/**
 * Generate combined SVG
 */
function generateCombinedSVG(data) {
  const width = 1000;
  const height = 400;
  const padding = { top: 40, right: 20, bottom: 60, left: 80 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const weekCount = data[ACCOUNTS[0]].weeklyData.length;
  const combinedData = new Array(weekCount).fill(0);
  
  Object.values(data).forEach(accountData => {
    accountData.weeklyData.forEach((val, idx) => {
      combinedData[idx] += val;
    });
  });

  const maxValue = Math.max(...combinedData, 1);
  const yStep = Math.ceil(maxValue / 5);
  const yMax = Math.ceil(maxValue / yStep) * yStep;
  const totalAll = Object.values(data).reduce((sum, d) => sum + d.totalContributions, 0);

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
<style>
  text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; }
  .title { font-size: 18px; font-weight: bold; fill: #00d4ff; }
  .label { font-size: 11px; fill: #666; }
  .value { font-size: 10px; fill: #333; font-weight: bold; }
  .grid { stroke: #eee; stroke-width: 0.5; }
  .line { stroke-width: 2; fill: none; stroke-linecap: round; stroke-linejoin: round; }
</style>

<!-- Background -->
<rect width="${width}" height="${height}" fill="white"/>

<!-- Title -->
<text x="${width/2}" y="25" class="title" text-anchor="middle">Combined (All 3 Accounts)</text>
<text x="${width/2}" y="37" class="label" text-anchor="middle">Total: ${totalAll} commits</text>
`;

  // Grid
  for (let i = 0; i <= yMax; i += yStep) {
    const y = padding.top + plotHeight - (i / yMax) * plotHeight;
    svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" class="grid"/>`;
    svg += `<text x="${padding.left - 5}" y="${y + 3}" class="label" text-anchor="end">${i}</text>`;
  }

  // Individual lines
  Object.entries(data).forEach(([account, accountData]) => {
    let pathData = '';
    for (let i = 0; i < accountData.weeklyData.length; i++) {
      const x = padding.left + (i / weekCount) * plotWidth;
      const y = padding.top + plotHeight - (accountData.weeklyData[i] / yMax) * plotHeight;
      pathData += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
    }
    svg += `<path d="${pathData}" class="line" stroke="${ACCOUNT_COLORS[account].color}" opacity="0.6"/>`;
  });

  // Combined line
  let combinedPath = '';
  for (let i = 0; i < combinedData.length; i++) {
    const x = padding.left + (i / weekCount) * plotWidth;
    const y = padding.top + plotHeight - (combinedData[i] / yMax) * plotHeight;
    combinedPath += i === 0 ? `M ${x} ${y}` : ` L ${x} ${y}`;
  }
  svg += `<path d="${combinedPath}" class="line" stroke="#00d4ff" stroke-width="3"/>`;

  // Axes
  svg += `<line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" stroke="#333" stroke-width="1"/>`;
  svg += `<line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${width - padding.right}" y2="${padding.top + plotHeight}" stroke="#333" stroke-width="1"/>`;

  // Legend
  const legendY = height - 20;
  let legendX = padding.left;
  const legendItems = [
    { label: 'syedasadabbas', color: ACCOUNT_COLORS.syedasadabbas.color },
    { label: 'syedprog', color: ACCOUNT_COLORS.syedprog.color },
    { label: 'syedprogg', color: ACCOUNT_COLORS.syedprogg.color },
  ];
  
  legendItems.forEach(item => {
    svg += `<line x1="${legendX}" y1="${legendY}" x2="${legendX + 15}" y2="${legendY}" stroke="${item.color}" stroke-width="2"/>`;
    svg += `<text x="${legendX + 20}" y="${legendY + 3}" class="label">${item.label}</text>`;
    legendX += 250;
  });

  svg += `</svg>`;
  return svg;
}

async function main() {
  try {
    console.log('\n📊 Generating All-Time Contribution Graphs...\n');
    
    const data = await fetchAllContributions();

    // Generate individual graphs
    for (const account of ACCOUNTS) {
      try {
        const svg = generateIndividualSVG(
          account,
          data[account].weeklyData,
          data[account].totalContributions,
          ACCOUNT_COLORS[account].color
        );
        const filename = `CONTRIBUTION_GRAPH_${account.toUpperCase()}.svg`;
        fs.writeFileSync(filename, svg, 'utf-8');
        console.log(`✅ Generated ${filename}`);
      } catch (error) {
        console.error(`❌ Failed to generate ${account} graph: ${error.message}`);
      }
    }

    // Generate combined graph
    try {
      const combinedSvg = generateCombinedSVG(data);
      fs.writeFileSync('CONTRIBUTION_GRAPH.svg', combinedSvg, 'utf-8');
      console.log(`✅ Generated CONTRIBUTION_GRAPH.svg`);
    } catch (error) {
      console.error(`❌ Failed to generate combined graph: ${error.message}`);
    }

    console.log(`\n📊 Graph Generation Complete!\n`);
    console.log(`Account Summary:`);
    Object.entries(data).forEach(([account, accountData]) => {
      console.log(`  ✅ ${account}: ${accountData.totalContributions} commits, ${accountData.repositoriesCount} repos`);
    });
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
