import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';

export interface Log {
  Datum: Date;
  Uhrzeit: string;
  Loglevel: string;
  Nachricht: string;
  Quelle: string;
}

const logs: Log[] = [];

@Injectable({
  providedIn: 'root',
})
export class LogConverterService {
  private sourceMapping: Record<string, string[]> = {};

  constructor(private http: HttpClient) {
    this.loadSourceMapping();
  }

  private loadSourceMapping(): void {
    this.http.get<Record<string, string[]>>('/assets/source.json').subscribe({
      next: (data) => (this.sourceMapping = data),
    });
  }

  getLogs(): Log[] {
    return logs;
  }

  parseLogs(logContent: string, fileName: string): Log[] {
    const logLines = logContent.split('\n').map((line) => line.trim());
    const parsedLogs: Log[] = [];

    const isPreferencesFormat = logLines[0]
      ?.trimStart()
      .startsWith('# preferences generated by');

    if (isPreferencesFormat) {
      const now = new Date();
      const currentDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate()
      );
      const currentTime = now.toTimeString().split(' ')[0];

      for (let i = 0; i < logLines.length; i++) {
        const line = logLines[i];
        if (!line) continue;

        if (i === 0) {
          parsedLogs.push({
            Datum: i === 0 ? currentDate : (undefined as unknown as Date),
            Uhrzeit: currentTime,
            Loglevel: '',
            Nachricht: line,
            Quelle: '',
          });
          continue;
        }

        if (line.includes('=')) {
          const [key, value] = line.split('=');
          parsedLogs.push({
            Datum: currentDate,
            Uhrzeit: currentTime,
            Loglevel: '',
            Nachricht: `${key.trim()} = ${value.trim()}`,
            Quelle: '',
          });
        }
      }

      return parsedLogs;
    }

    const logRegex =
      /(\d{4}[-.]\d{2}[-.]\d{2}|\d{2}[-.]\d{2}[-.]\d{4})[ \t]+(\d{2}:\d{2}:\d{2})(?:\.\d{1,4})?[ \t]*(\[?(Info|Warn|Error|Fatal|INF|WRN|ERR|FTL)?\]?)?:?[ \t]*(.*)/;

    const serilogRegex =
      /^\[(\d{4}\.\d{2}\.\d{2}) (\d{2}:\d{2}:\d{2})\.\d{3} ([A-Z]+)\s+([\w\d.\s]+)\s*\]? (.*)$/;

    let currentLog: Log | null = null;

    logLines.forEach((line) => {
      if (fileName === 'preferences.txt') {
        line = line.replace(/ /g, '\n');
      }
      let match = serilogRegex.exec(line);
      const isSerilog = !!match;

      if (!isSerilog) {
        match = logRegex.exec(line);
      }

      if (match) {
        if (currentLog) {
          parsedLogs.push(currentLog);
        }

        const [, date, time, logLevel, rawSource, message] = match;
        const cleanedMessage = message?.trim() || '';
        const cleanedLogLevel = logLevel?.replace(/[[\]]/g, '') || '';
        const source = isSerilog
          ? rawSource
          : this.determineSource(cleanedLogLevel, cleanedMessage);

        currentLog = {
          Datum: this.formatDateAsDateObj(date, isSerilog),
          Uhrzeit: time.split('.')[0],
          Loglevel: cleanedLogLevel,
          Nachricht: cleanedMessage,
          Quelle: source,
        };
      } else if (currentLog) {
        currentLog.Nachricht += ' ' + line;
      } else {
        const cleanedMessage = line.trim();
        const log: Log = {
          Datum: undefined as unknown as Date,
          Uhrzeit: '',
          Loglevel: '',
          Nachricht: cleanedMessage,
          Quelle: '',
        };
        parsedLogs.push(log);
      }
    });

    if (currentLog) {
      parsedLogs.push(currentLog);
    }

    return parsedLogs;
  }

  formatDate(date: string): string {
    if (date.includes('-')) {
      return date.replace(/-/g, '.');
    }
    const parts = date.split('.');
    if (parts.length === 3) {
      return `${parts[2]}.${parts[1]}.${parts[0]}`;
    }

    return date;
  }

  determineSource(logLevel: string, message: string): string {
    for (const [source, keywords] of Object.entries(this.sourceMapping)) {
      if (keywords.some((keyword) => message.includes(keyword))) {
        return source;
      }
    }
    return '';
  }

  formatDateAsDateObj(date: string, isSerilog = false): Date {
    if (isSerilog) {
      const [yyyy, MM, dd] = date.split('.');
      return new Date(parseInt(yyyy), parseInt(MM) - 1, parseInt(dd));
    }

    if (date.includes('-')) {
      const parts = date.split('-');
      if (parseInt(parts[0]) > 31) {
        const [yyyy, MM, dd] = parts;
        return new Date(parseInt(yyyy), parseInt(MM) - 1, parseInt(dd));
      } else {
        const [dd, MM, yyyy] = parts;
        return new Date(parseInt(yyyy), parseInt(MM) - 1, parseInt(dd));
      }
    } else {
      const [dd, MM, yyyy] = date.split('.');
      return new Date(parseInt(yyyy), parseInt(MM) - 1, parseInt(dd));
    }
  }
}
