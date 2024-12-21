function getTwoNumberDate(date: number) {
  return date > 9 ? date : `0${date}`;
}

export function getISOTimestamp(date: Date) {
  return `${date.getUTCFullYear()}-${getTwoNumberDate(date.getUTCMonth())}-${getTwoNumberDate(date.getUTCDay())}T${getTwoNumberDate(date.getUTCHours())}:${getTwoNumberDate(date.getUTCMinutes())}:${getTwoNumberDate(date.getUTCSeconds())}Z`;
}
