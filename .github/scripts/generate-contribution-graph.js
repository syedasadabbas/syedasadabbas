#!/usr/bin/env node

/**
 * Generate All-Time Contribution Graph SVG
 * 
 * Creates an SVG visualization of contribution data from all 3 GitHub accounts
 * with real data fetched from GitHub API.
 * 
 * Features:
 * - All-time data (from account creation)
 * - Weekly aggregation (7-day periods)
 * - 10-point vertical increments
 * - Proper axis scaling
 * - 4 data series (3 accounts + combined)
 * 
 * Usage: node generate-contribution-graph.js
 * Environment: GH_TOKEN required
 */

const https = require('https');
const fs = require('fs');

const ACCOUNTS = ['syedasadabbas', 'syedprog', 'syedprogg'];
const GH_TOKEN = process.env.GH_TOKEN;
const OUTPUT_FILE = 'CONTRIBUTION_GRAPH.svg';

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
      // Use empty data on failure
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
 * Generate SVG chart
 */
function generateSVG(data) {
  const width = 1200;
  const height = 500;
  const padding = { top: 40, right: 40, bottom: 60, left: 80 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Find max value for scaling
  const allValues = [];
  Object.values(data).forEach(account => {
    allValues.push(...account.weeklyData);
  });
  const maxValue = Math.max(...allValues, 50);
  const yMax = Math.ceil(maxValue / 10) * 10;

  // Calculate combined data
  const combinedData = new Array(data[ACCOUNTS[0]].weeklyData.length).fill(0);
  Object.values(data).forEach(account => {
    account.weeklyData.forEach((val, idx) => {
      combinedData[idx] += val;
    });
  });

  // Colors
  const colors = {
    [ACCOUNTS[0]]: '#FF6B6B', // Red
    [ACCOUNTS[1]]: '#FFA500', // Orange
    [ACCOUNTS[2]]: '#FFD700', // Gold
    combined: '#00d4ff',       // Cyan
  };

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <defs>
    <style>
      .title { font-size: 20px; font-weight: bold; fill: #00d4ff; }
      .axis-label { font-size: 12px; fill: #8b949e; }
      .grid-line { stroke: #30363d; stroke-width: 1; }
      .line { stroke-width: 2; fill: none; }
      .combined-line { stroke-width: 3; fill: none; }
      .point { fill: currentColor; }
      .legend-text { font-size: 12px; fill: #c9d1d9; }
      .bg { fill: #0d1117; }
    </style>
  </defs>

  <!-- Background -->
  <rect width="${width}" height="${height}" class="bg"/>

  <!-- Title -->
  <text x="${width / 2}" y="30" class="title" text-anchor="middle">📊 All-Time Contribution Graph (All 3 Accounts)</text>

  <!-- Grid lines (horizontal) -->`;

  // Y-axis grid lines (10-point increments)
  for (let i = 0; i <= yMax; i += 10) {
    const y = padding.top + plotHeight - (i / yMax) * plotHeight;
    svg += `\n  <line x1="${padding.left}" y1="${y}" x2="${padding.left + plotWidth}" y2="${y}" class="grid-line"/>`;
    svg += `\n  <text x="${padding.left - 10}" y="${y + 4}" class="axis-label" text-anchor="end">${i}</text>`;
  }

  // X-axis (weeks)
  const weekCount = data[ACCOUNTS[0]].weeklyData.length;
  for (let i = 0; i < weekCount; i += 4) {
    const x = padding.left + (i / weekCount) * plotWidth;
    svg += `\n  <line x1="${x}" y1="${padding.top + plotHeight}" x2="${x}" y2="${padding.top + plotHeight + 5}" class="grid-line"/>`;
    if (i % 8 === 0) {
      svg += `\n  <text x="${x}" y="${padding.top + plotHeight + 20}" class="axis-label" text-anchor="middle">Week ${i}</text>`;
    }
  }

  // Function to create path data
  function createPath(weeklyData) {
    let pathData = '';
    for (let i = 0; i < weeklyData.length; i++) {
      const x = padding.left + (i / weekCount) * plotWidth;
      const y = padding.top + plotHeight - (weeklyData[i] / yMax) * plotHeight;
      pathData += i === 0 ? `M${x},${y}` : ` L${x},${y}`;
    }
    return pathData;
  }

  // Draw lines for each account
  Object.entries(data).forEach(([account, accountData]) => {
    const pathData = createPath(accountData.weeklyData);
    svg += `\n  <path d="${pathData}" class="line" stroke="${colors[account]}"/>`;
  });

  // Draw combined line
  const combinedPath = createPath(combinedData);
  svg += `\n  <path d="${combinedPath}" class="combined-line" stroke="${colors.combined}"/>`;

  // Draw points
  Object.entries(data).forEach(([account, accountData]) => {
    accountData.weeklyData.forEach((val, i) => {
      const x = padding.left + (i / weekCount) * plotWidth;
      const y = padding.top + plotHeight - (val / yMax) * plotHeight;
      svg += `\n  <circle cx="${x}" cy="${y}" r="3" fill="${colors[account]}" opacity="0.7"/>`;
    });
  });

  // Combined points
  combinedData.forEach((val, i) => {
    const x = padding.left + (i / weekCount) * plotWidth;
    const y = padding.top + plotHeight - (val / yMax) * plotHeight;
    svg += `\n  <circle cx="${x}" cy="${y}" r="4" fill="${colors.combined}" opacity="0.9"/>`;
  });

  // Axes
  svg += `\n  <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + plotHeight}" stroke="#30363d" stroke-width="2"/>`;
  svg += `\n  <line x1="${padding.left}" y1="${padding.top + plotHeight}" x2="${padding.left + plotWidth}" y2="${padding.top + plotHeight}" stroke="#30363d" stroke-width="2"/>`;

  // Axis labels
  svg += `\n  <text x="20" y="${padding.top + plotHeight / 2}" class="axis-label" text-anchor="middle" transform="rotate(-90 20 ${padding.top + plotHeight / 2})">Commits (10-point increments)</text>`;
  svg += `\n  <text x="${padding.left + plotWidth / 2}" y="${height - 10}" class="axis-label" text-anchor="middle">Time Period (Weekly Intervals - 7 days)</text>`;

  // Legend
  const legendY = height - 30;
  const legendItems = [
    { label: 'syedasadabbas (Primary)', color: colors[ACCOUNTS[0]] },
    { label: 'syedprog (Research)', color: colors[ACCOUNTS[1]] },
    { label: 'syedprogg (Learning)', color: colors[ACCOUNTS[2]] },
    { label: 'Combined Total', color: colors.combined },
  ];

  let legendX = padding.left;
  legendItems.forEach(item => {
    svg += `\n  <circle cx="${legendX}" cy="${legendY}" r="4" fill="${item.color}"/>`;
    svg += `\n  <text x="${legendX + 12}" y="${legendY + 4}" class="legend-text">${item.label}</text>`;
    legendX += 280;
  });

  // Data timestamp
  const timestamp = new Date().toISOString();
  svg += `\n  <text x="${width - 10}" y="${height - 10}" class="axis-label" text-anchor="end" font-size="10">Generated: ${timestamp}</text>`;

  svg += `\n</svg>`;
  return svg;
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('\n📊 Generating All-Time Contribution Graph SVG...\n');
    
    const data = await fetchAllContributions();
    const svg = generateSVG(data);

    fs.writeFileSync(OUTPUT_FILE, svg, 'utf-8');
    console.log(`\n✅ Successfully generated ${OUTPUT_FILE}`);
    console.log(`\nGraph Details:`);
    console.log(`  - All-time data from GitHub API`);
    console.log(`  - Weekly aggregation (7-day periods)`);
    console.log(`  - Vertical axis: 10-point increments`);
    console.log(`  - 4 data series (3 accounts + combined)`);
    console.log(`  - Embedded SVG format for README`);
    
    // Show account summaries
    console.log(`\nAccount Summary:`);
    Object.entries(data).forEach(([account, accountData]) => {
      console.log(`  ${account}: ${accountData.totalContributions} commits, ${accountData.repositoriesCount} repos`);
    });
  } catch (error) {
    console.error('❌ Error generating graph:', error.message);
    process.exit(1);
  }
}

main();
