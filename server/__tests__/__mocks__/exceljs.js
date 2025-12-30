/**
 * Mock for exceljs module
 * Used in Jest tests to avoid native module issues
 */

class MockCell {
  constructor(value) {
    this.value = value;
    this.font = {};
    this.fill = {};
    this.border = {};
    this.alignment = {};
  }
}

class MockRow {
  constructor() {
    this.cells = [];
    this.font = {};
    this.height = 15;
  }

  getCell(index) {
    if (!this.cells[index]) {
      this.cells[index] = new MockCell(null);
    }
    return this.cells[index];
  }

  eachCell(callback) {
    this.cells.forEach((cell, index) => callback(cell, index));
  }
}

class MockColumn {
  constructor() {
    this.width = 10;
    this.header = '';
    this.key = '';
    this.cells = [];
  }

  eachCell(options, callback) {
    if (typeof options === 'function') {
      callback = options;
    }
    this.cells.forEach((cell, index) => callback(cell, index));
  }
}

class MockWorksheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
    this._columns = [];
    this.properties = {};
    this.state = 'visible';
    this.views = [];
    this.autoFilter = null;
  }

  get columns() {
    return this._columns;
  }

  set columns(cols) {
    this._columns = cols.map(col => {
      const mockCol = new MockColumn();
      mockCol.header = col.header;
      mockCol.key = col.key;
      mockCol.width = col.width || 10;
      return mockCol;
    });
  }

  addRow(data) {
    const row = new MockRow();
    if (Array.isArray(data)) {
      data.forEach((val, idx) => {
        row.cells[idx + 1] = new MockCell(val);
      });
    } else if (typeof data === 'object') {
      Object.entries(data).forEach(([key, val], idx) => {
        row.cells[idx + 1] = new MockCell(val);
      });
    }
    this.rows.push(row);
    return row;
  }

  addRows(dataArray) {
    dataArray.forEach(data => this.addRow(data));
  }

  getRow(index) {
    if (!this.rows[index - 1]) {
      this.rows[index - 1] = new MockRow();
    }
    return this.rows[index - 1];
  }

  getColumn(index) {
    if (!this._columns[index - 1]) {
      this._columns[index - 1] = new MockColumn();
    }
    return this._columns[index - 1];
  }

  mergeCells(range) {
    // Mock merge - do nothing
  }

  eachRow(options, callback) {
    if (typeof options === 'function') {
      callback = options;
    }
    this.rows.forEach((row, index) => callback(row, index + 1));
  }
}

class Workbook {
  constructor() {
    this.worksheets = [];
    this.creator = '';
    this.lastModifiedBy = '';
    this.created = new Date();
    this.modified = new Date();
    this.company = '';
    this.properties = {};
  }

  addWorksheet(name, options) {
    const sheet = new MockWorksheet(name);
    this.worksheets.push(sheet);
    return sheet;
  }

  getWorksheet(nameOrIndex) {
    if (typeof nameOrIndex === 'number') {
      return this.worksheets[nameOrIndex - 1];
    }
    return this.worksheets.find(ws => ws.name === nameOrIndex);
  }

  removeWorksheet(nameOrIndex) {
    if (typeof nameOrIndex === 'number') {
      this.worksheets.splice(nameOrIndex - 1, 1);
    } else {
      const index = this.worksheets.findIndex(ws => ws.name === nameOrIndex);
      if (index >= 0) {
        this.worksheets.splice(index, 1);
      }
    }
  }

  get xlsx() {
    return {
      writeFile: jest.fn().mockResolvedValue(undefined),
      writeBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-excel-data')),
      readFile: jest.fn().mockResolvedValue(this),
      read: jest.fn().mockResolvedValue(this)
    };
  }

  get csv() {
    return {
      writeFile: jest.fn().mockResolvedValue(undefined),
      writeBuffer: jest.fn().mockResolvedValue(Buffer.from('mock-csv-data')),
      readFile: jest.fn().mockResolvedValue(this),
      read: jest.fn().mockResolvedValue(this)
    };
  }
}

module.exports = {
  Workbook
};
