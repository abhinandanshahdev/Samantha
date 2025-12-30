/**
 * Artifact Service
 *
 * Handles artifact downloads and parsing artifact references from AI responses.
 */

import api from './apiService';

export interface Artifact {
  id: string;
  type: 'presentation' | 'spreadsheet' | 'csv' | 'json' | 'markdown';
  title: string;
  fileName: string;
  mimeType: string;
  downloadUrl: string;
  createdAt?: string;
}

export interface ArtifactReference {
  id: string;
  type: string;
  title: string;
  fileName: string;
  downloadUrl: string;
}

/**
 * Parse artifact references from AI response text
 * Looks for JSON objects with artifact information in the response
 * Uses balanced-brace extraction to handle nested JSON properly
 */
export const parseArtifactsFromResponse = (responseText: string): ArtifactReference[] => {
  const artifacts: ArtifactReference[] = [];

  // Find all potential artifact JSON start patterns
  const startPattern = /\{"success"\s*:\s*true\s*,\s*"artifact"\s*:\s*\{/g;
  let startMatch;

  while ((startMatch = startPattern.exec(responseText)) !== null) {
    const startIndex = startMatch.index;

    // Extract balanced JSON by counting braces
    let braceCount = 0;
    let endIndex = startIndex;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < responseText.length; i++) {
      const char = responseText[i];

      if (escape) {
        escape = false;
        continue;
      }

      if (char === '\\') {
        escape = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === '{') braceCount++;
        if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            endIndex = i + 1;
            break;
          }
        }
      }
    }

    if (endIndex > startIndex) {
      try {
        const jsonStr = responseText.substring(startIndex, endIndex);
        const parsed = JSON.parse(jsonStr);
        if (parsed.success && parsed.artifact) {
          artifacts.push({
            id: parsed.artifact.id,
            type: parsed.artifact.type,
            title: parsed.artifact.title,
            fileName: parsed.artifact.fileName,
            downloadUrl: parsed.artifact.downloadUrl
          });
        }
      } catch (e) {
        // Skip malformed JSON
        console.warn('Failed to parse artifact JSON:', e);
      }
    }
  }

  // Also look for download URL patterns in the text as fallback
  const urlPattern = /\/api\/artifacts\/([a-f0-9-]+)\/download/g;
  let urlMatch;
  while ((urlMatch = urlPattern.exec(responseText)) !== null) {
    const artifactId = urlMatch[1];
    // Check if we already have this artifact
    if (!artifacts.find(a => a.id === artifactId)) {
      artifacts.push({
        id: artifactId,
        type: 'unknown',
        title: 'Download',
        fileName: 'artifact',
        downloadUrl: urlMatch[0]
      });
    }
  }

  return artifacts;
};

/**
 * Get artifact metadata by ID
 */
export const getArtifact = async (artifactId: string): Promise<Artifact | null> => {
  try {
    const response = await api.get(`/artifacts/${artifactId}`);
    if (response.data.success) {
      return response.data.artifact;
    }
    return null;
  } catch (error) {
    console.error('Failed to get artifact:', error);
    return null;
  }
};

/**
 * List all artifacts
 */
export const listArtifacts = async (): Promise<Artifact[]> => {
  try {
    const response = await api.get('/artifacts');
    if (response.data.success) {
      return response.data.artifacts;
    }
    return [];
  } catch (error) {
    console.error('Failed to list artifacts:', error);
    return [];
  }
};

/**
 * Get recent artifacts created within the last N seconds
 * Used for recovery when stream connection is lost
 */
export const getRecentArtifacts = async (withinSeconds: number = 120): Promise<ArtifactReference[]> => {
  try {
    const response = await api.get('/artifacts');
    if (response.data.success && response.data.artifacts) {
      const now = Date.now();
      const cutoff = now - (withinSeconds * 1000);

      return response.data.artifacts
        .filter((a: any) => {
          const createdAt = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          return createdAt > cutoff;
        })
        .map((a: any) => ({
          id: a.id,
          type: a.type,
          title: a.title,
          fileName: a.fileName,
          downloadUrl: `/api/artifacts/${a.id}/download`
        }));
    }
    return [];
  } catch (error) {
    console.error('Failed to get recent artifacts:', error);
    return [];
  }
};

/**
 * Download an artifact
 */
export const downloadArtifact = async (artifactId: string, fileName?: string): Promise<void> => {
  try {
    const response = await api.get(`/artifacts/${artifactId}/download`, {
      responseType: 'blob'
    });

    // Create download link
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName || 'download');
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Failed to download artifact:', error);
    throw error;
  }
};

/**
 * Get the file icon based on artifact type
 */
export const getArtifactIcon = (type: string): string => {
  switch (type) {
    case 'presentation':
      return 'file-powerpoint';
    case 'spreadsheet':
      return 'file-excel';
    case 'csv':
      return 'file-csv';
    case 'json':
      return 'file-code';
    case 'markdown':
      return 'file-text';
    default:
      return 'file';
  }
};

/**
 * Get human-readable type name
 */
export const getArtifactTypeName = (type: string): string => {
  switch (type) {
    case 'presentation':
      return 'PowerPoint';
    case 'spreadsheet':
      return 'Excel';
    case 'document':
      return 'Word Document';
    case 'csv':
      return 'CSV';
    case 'json':
      return 'JSON';
    case 'markdown':
      return 'Markdown';
    default:
      return 'File';
  }
};
