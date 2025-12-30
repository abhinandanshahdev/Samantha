const mysql = require('mysql2/promise');

async function checkAndFixOutcomes() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'ai_use_case_repository'
  });

  try {
    console.log('Connected to database\n');

    // Check current outcomes
    const [outcomes] = await connection.query('SELECT * FROM outcomes ORDER BY domain_id, display_order');

    console.log('Current outcomes in database:');
    console.log('=====================================');
    outcomes.forEach(outcome => {
      console.log(`Domain ${outcome.domain_id}: ${outcome.title}`);
      console.log(`  Key: ${outcome.outcome_key}`);
      console.log(`  Measure: ${outcome.measure}`);
      console.log(`  Progress: ${outcome.progress}% ${outcome.maturity ? `(Maturity: ${outcome.maturity}/5)` : ''}`);
      console.log('');
    });

    // Check if we need to add Data domain outcomes
    const [dataOutcomes] = await connection.query('SELECT * FROM outcomes WHERE domain_id = 2');

    if (dataOutcomes.length === 0) {
      console.log('No Data domain outcomes found. Adding them...\n');

      const dataOutcomesData = [
        {
          domain_id: 2,
          outcome_key: 'data_quality',
          title: 'Data Quality & Integrity',
          measure: '% of datasets meeting quality standards',
          progress: 75,
          display_order: 1
        },
        {
          domain_id: 2,
          outcome_key: 'data_accessibility',
          title: 'Data Accessibility & Democratization',
          measure: '% of business users with self-service data access',
          progress: 60,
          display_order: 2
        },
        {
          domain_id: 2,
          outcome_key: 'governance_compliance',
          title: 'Governance & Compliance',
          measure: '% of data assets with proper governance controls',
          progress: 80,
          display_order: 3
        }
      ];

      for (const outcome of dataOutcomesData) {
        await connection.query(
          'INSERT INTO outcomes (domain_id, outcome_key, title, measure, progress, display_order) VALUES (?, ?, ?, ?, ?, ?)',
          [outcome.domain_id, outcome.outcome_key, outcome.title, outcome.measure, outcome.progress, outcome.display_order]
        );
      }

      console.log('✅ Data domain outcomes added successfully!');
    } else {
      console.log(`✅ Data domain already has ${dataOutcomes.length} outcomes configured.`);
    }

    console.log('\n=====================================');
    console.log('Summary:');
    const [aiCount] = await connection.query('SELECT COUNT(*) as count FROM outcomes WHERE domain_id = 1');
    const [dataCount] = await connection.query('SELECT COUNT(*) as count FROM outcomes WHERE domain_id = 2');
    console.log(`AI Domain outcomes: ${aiCount[0].count}`);
    console.log(`Data Domain outcomes: ${dataCount[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

checkAndFixOutcomes();
