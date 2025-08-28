/**
 * Utility functions for date formatting and timezone handling
 */

/**
 * Format a date string with proper timezone handling
 * Handles both Z and +00:00 timezone formats from backend
 * 
 * @param dateString - Date string from backend (can be null/undefined)
 * @returns Formatted date string or fallback message
 */
export const formatDate = (dateString: string | null | undefined): string => {
  if (!dateString || dateString.trim() === '') {
    return 'No date available';
  }
  
  try {
    // Handle both Z and +00:00 timezone formats
    let formattedDateString = dateString;
    
    // If date already has timezone info (+00:00, +05:30, Z, etc.), use as-is
    if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
      formattedDateString = dateString;
    } else {
      // If no timezone info, assume UTC and add Z
      formattedDateString = dateString + 'Z';
    }
    
    const date = new Date(formattedDateString);
    if (isNaN(date.getTime())) {
      return 'Invalid date format';
    }
    return date.toLocaleString();
  } catch {
    return 'Invalid date format';
  }
};

/**
 * Format a date string to local date only (no time)
 * 
 * @param dateString - Date string from backend
 * @returns Formatted date string or fallback message
 */
export const formatDateOnly = (dateString: string | null | undefined): string => {
  if (!dateString || dateString.trim() === '') {
    return 'No date available';
  }
  
  try {
    // Handle both Z and +00:00 timezone formats
    let formattedDateString = dateString;
    
    // If date already has timezone info (+00:00, +05:30, Z, etc.), use as-is
    if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
      formattedDateString = dateString;
    } else {
      // If no timezone info, assume UTC and add Z
      formattedDateString = dateString + 'Z';
    }
    
    const date = new Date(formattedDateString);
    if (isNaN(date.getTime())) {
      return 'Invalid date format';
    }
    return date.toLocaleDateString();
  } catch {
    return 'Invalid date format';
  }
};

/**
 * Convert a date string to a Date object with proper timezone handling
 * 
 * @param dateString - Date string from backend
 * @returns Date object or null if invalid
 */
export const parseDate = (dateString: string | null | undefined): Date | null => {
  if (!dateString || dateString.trim() === '') {
    return null;
  }
  
  try {
    // Handle both Z and +00:00 timezone formats
    let formattedDateString = dateString;
    
    // If date already has timezone info (+00:00, +05:30, Z, etc.), use as-is
    if (dateString.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(dateString)) {
      formattedDateString = dateString;
    } else {
      // If no timezone info, assume UTC and add Z
      formattedDateString = dateString + 'Z';
    }
    
    const date = new Date(formattedDateString);
    if (isNaN(date.getTime())) {
      return null;
    }
    return date;
  } catch {
    return null;
  }
};


