const db = require('../config/database-mysql-compat');

/**
 * Seeds default departments for all existing domains
 * This is useful for:
 * 1. Initial migration to domain-specific departments
 * 2. Adding default departments to newly created domains
 */

const DEFAULT_DEPARTMENTS = [
  'Government Financial Affairs',
  'Executive Financial Affairs',
  'Investment and Economic Affairs',
  'Legal and Compliance Affairs',
  'Corporate Affairs'
];

async function seedDefaultDepartments(domainId = null) {
  return new Promise((resolve, reject) => {
    // Get domains to seed
    const domainQuery = domainId
      ? 'SELECT id, name FROM domains WHERE id = ?'
      : 'SELECT id, name FROM domains WHERE is_active = 1';

    const queryParams = domainId ? [domainId] : [];

    db.query(domainQuery, queryParams, (err, domains) => {
      if (err) {
        console.error('Error fetching domains:', err);
        return reject(err);
      }

      if (domains.length === 0) {
        console.log('No domains found to seed departments');
        return resolve({ domainsProcessed: 0, departmentsCreated: 0 });
      }

      let processedCount = 0;
      let createdCount = 0;
      let errors = [];

      domains.forEach(domain => {
        console.log(`Seeding default departments for domain: ${domain.name} (ID: ${domain.id})`);

        DEFAULT_DEPARTMENTS.forEach(deptName => {
          // Check if department already exists for this domain
          db.query(
            'SELECT id FROM departments WHERE name = ? AND domain_id = ?',
            [deptName, domain.id],
            (err, existing) => {
              if (err) {
                errors.push({ domain: domain.name, department: deptName, error: err });
                return;
              }

              if (existing.length > 0) {
                console.log(`  - Department "${deptName}" already exists for ${domain.name}`);
                return;
              }

              // Insert new department
              db.query(
                'INSERT INTO departments (name, domain_id) VALUES (?, ?)',
                [deptName, domain.id],
                (err, result) => {
                  if (err) {
                    console.error(`  - Error creating department "${deptName}":`, err.message);
                    errors.push({ domain: domain.name, department: deptName, error: err });
                  } else {
                    console.log(`  - Created department "${deptName}" (ID: ${result.insertId})`);
                    createdCount++;
                  }
                }
              );
            }
          );
        });

        processedCount++;

        // When all domains are processed
        if (processedCount === domains.length) {
          setTimeout(() => {
            if (errors.length > 0) {
              console.error('\nErrors encountered:');
              errors.forEach(e => console.error(`  - ${e.domain} / ${e.department}:`, e.error.message));
            }

            console.log(`\nMigration complete:`);
            console.log(`  - Domains processed: ${processedCount}`);
            console.log(`  - Departments created: ${createdCount}`);
            console.log(`  - Errors: ${errors.length}`);

            resolve({
              domainsProcessed: processedCount,
              departmentsCreated: createdCount,
              errors: errors.length
            });
          }, 2000); // Wait for async operations to complete
        }
      });
    });
  });
}

// Run migration if called directly
if (require.main === module) {
  console.log('Starting default departments seeding...\n');

  seedDefaultDepartments()
    .then(result => {
      console.log('\nSeeding completed successfully!');
      process.exit(0);
    })
    .catch(err => {
      console.error('\nSeeding failed:', err);
      process.exit(1);
    });
}

module.exports = { seedDefaultDepartments, DEFAULT_DEPARTMENTS };
