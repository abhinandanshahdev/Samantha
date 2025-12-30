const db = require('../config/database-mysql-compat');

/**
 * Default categories to seed for new domains
 */
const DEFAULT_CATEGORIES = [
  {
    name: 'Internally deploy LLMs',
    description: 'Deploy and manage Large Language Models internally within the organization'
  },
  {
    name: 'Leverage Vendor embedded solutions',
    description: 'Utilize third-party vendor solutions with embedded AI capabilities'
  },
  {
    name: 'Leverage Copilot',
    description: 'Use Microsoft Copilot and related tools for productivity enhancement'
  },
  {
    name: 'Leverage DGE',
    description: 'Leverage Digital Government Excellence platform and tools'
  },
  {
    name: 'Build ML',
    description: 'Build custom Machine Learning models and solutions from scratch'
  }
];

/**
 * Default departments to seed for new domains
 */
const DEFAULT_DEPARTMENTS = [
  'Government Financial Affairs',
  'Executive Financial Affairs',
  'Investment and Economic Affairs',
  'Legal and Compliance Affairs',
  'Corporate Affairs'
];

/**
 * Seeds default categories for a specific domain
 * @param {number} domainId - The domain ID to seed categories for
 * @returns {Promise<{created: number, errors: Array}>}
 */
async function seedDefaultCategories(domainId) {
  return new Promise((resolve, reject) => {
    let created = 0;
    let errors = [];
    let processed = 0;

    if (!domainId) {
      return reject(new Error('Domain ID is required'));
    }

    DEFAULT_CATEGORIES.forEach(category => {
      db.query(
        'SELECT id FROM categories WHERE name = ? AND domain_id = ?',
        [category.name, domainId],
        (err, existing) => {
          if (err) {
            errors.push({ category: category.name, error: err.message });
            processed++;
            if (processed === DEFAULT_CATEGORIES.length) {
              resolve({ created, errors });
            }
            return;
          }

          if (existing.length > 0) {
            console.log(`Category "${category.name}" already exists for domain ${domainId}`);
            processed++;
            if (processed === DEFAULT_CATEGORIES.length) {
              resolve({ created, errors });
            }
            return;
          }

          db.query(
            'INSERT INTO categories (name, description, domain_id) VALUES (?, ?, ?)',
            [category.name, category.description, domainId],
            (err, result) => {
              if (err) {
                console.error(`Error creating category "${category.name}":`, err.message);
                errors.push({ category: category.name, error: err.message });
              } else {
                console.log(`Created category "${category.name}" (ID: ${result.insertId}) for domain ${domainId}`);
                created++;
              }

              processed++;
              if (processed === DEFAULT_CATEGORIES.length) {
                resolve({ created, errors });
              }
            }
          );
        }
      );
    });
  });
}

/**
 * Seeds default departments for a specific domain
 * @param {number} domainId - The domain ID to seed departments for
 * @returns {Promise<{created: number, errors: Array}>}
 */
async function seedDefaultDepartments(domainId) {
  return new Promise((resolve, reject) => {
    let created = 0;
    let errors = [];
    let processed = 0;

    if (!domainId) {
      return reject(new Error('Domain ID is required'));
    }

    DEFAULT_DEPARTMENTS.forEach(deptName => {
      db.query(
        'SELECT id FROM departments WHERE name = ? AND domain_id = ?',
        [deptName, domainId],
        (err, existing) => {
          if (err) {
            errors.push({ department: deptName, error: err.message });
            processed++;
            if (processed === DEFAULT_DEPARTMENTS.length) {
              resolve({ created, errors });
            }
            return;
          }

          if (existing.length > 0) {
            console.log(`Department "${deptName}" already exists for domain ${domainId}`);
            processed++;
            if (processed === DEFAULT_DEPARTMENTS.length) {
              resolve({ created, errors });
            }
            return;
          }

          db.query(
            'INSERT INTO departments (name, domain_id) VALUES (?, ?)',
            [deptName, domainId],
            (err, result) => {
              if (err) {
                console.error(`Error creating department "${deptName}":`, err.message);
                errors.push({ department: deptName, error: err.message });
              } else {
                console.log(`Created department "${deptName}" (ID: ${result.insertId}) for domain ${domainId}`);
                created++;
              }

              processed++;
              if (processed === DEFAULT_DEPARTMENTS.length) {
                resolve({ created, errors });
              }
            }
          );
        }
      );
    });
  });
}

/**
 * Seeds both default categories and departments for a domain
 * @param {number} domainId - The domain ID to seed defaults for
 * @returns {Promise<{categories: object, departments: object}>}
 */
async function seedDomainDefaults(domainId) {
  console.log(`Seeding default categories and departments for domain ${domainId}...`);

  const categoriesResult = await seedDefaultCategories(domainId);
  const departmentsResult = await seedDefaultDepartments(domainId);

  console.log(`Seeding complete for domain ${domainId}:`);
  console.log(`  - Categories created: ${categoriesResult.created}`);
  console.log(`  - Departments created: ${departmentsResult.created}`);

  if (categoriesResult.errors.length > 0 || departmentsResult.errors.length > 0) {
    console.error('  - Errors encountered during seeding');
  }

  return {
    categories: categoriesResult,
    departments: departmentsResult
  };
}

module.exports = {
  seedDefaultCategories,
  seedDefaultDepartments,
  seedDomainDefaults,
  DEFAULT_CATEGORIES,
  DEFAULT_DEPARTMENTS
};
