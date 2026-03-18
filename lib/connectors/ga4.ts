import crypto from "crypto";
import type {
  PlatformConnector,
  NormalizedDailyAggregate,
} from "./types";

interface GA4ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

interface GA4TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface GA4ReportRow {
  dimensionValues: { value: string }[];
  metricValues: { value: string }[];
}

interface GA4RunReportResponse {
  rows?: GA4ReportRow[];
  rowCount?: number;
}

export interface GA4TrafficSource {
  channel: string;
  sessions: number;
  users: number;
  bounce_rate: number;
}

export interface GA4TopPage {
  page: string;
  sessions: number;
  users: number;
  views: number;
  avg_duration: number;
}

export interface GA4Geographic {
  country: string;
  sessions: number;
  users: number;
  bounce_rate: number;
}

export interface GA4Device {
  device: string;
  sessions: number;
  users: number;
  bounce_rate: number;
}

function base64urlEncode(data: string | Buffer): string {
  const buf = typeof data === "string" ? Buffer.from(data) : data;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export class GA4Connector implements PlatformConnector {
  platform = "ga4";

  private propertyId: string;
  private serviceAccountJson: string;

  constructor() {
    this.propertyId = process.env.GA4_PROPERTY_ID || "";
    this.serviceAccountJson = process.env.GA4_SERVICE_ACCOUNT_JSON || "";
  }

  private parseServiceAccount(): GA4ServiceAccount {
    try {
      return JSON.parse(this.serviceAccountJson);
    } catch {
      throw new Error(
        "Failed to parse GA4_SERVICE_ACCOUNT_JSON — ensure it is valid JSON"
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    const sa = this.parseServiceAccount();

    const now = Math.floor(Date.now() / 1000);

    // JWT Header
    const header = JSON.stringify({ alg: "RS256", typ: "JWT" });

    // JWT Payload
    const payload = JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: "https://oauth2.googleapis.com/token",
      scope: "https://www.googleapis.com/auth/analytics.readonly",
      iat: now,
      exp: now + 3600,
    });

    // Encode header and payload
    const encodedHeader = base64urlEncode(header);
    const encodedPayload = base64urlEncode(payload);
    const signingInput = `${encodedHeader}.${encodedPayload}`;

    // Sign with RSA-SHA256 using Node.js crypto
    const privateKey = crypto.createPrivateKey(sa.private_key);
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(privateKey);
    const encodedSignature = base64urlEncode(signature);

    const jwt = `${signingInput}.${encodedSignature}`;

    // Exchange JWT for access token
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `GA4 token exchange failed: ${response.status} ${errorText}`
      );
    }

    const data: GA4TokenResponse = await response.json();
    return data.access_token;
  }

  async fetchDailyAggregates(
    startDate: string,
    endDate: string
  ): Promise<NormalizedDailyAggregate[]> {
    if (!this.propertyId || !this.serviceAccountJson) {
      console.warn(
        "GA4 credentials not configured, returning empty results"
      );
      return [];
    }

    try {
      const accessToken = await this.getAccessToken();

      const requestBody = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
          { name: "bounceRate" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      };

      const response = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `GA4 runReport API error: ${response.status} ${errorText}`
        );
      }

      const data: GA4RunReportResponse = await response.json();

      if (!data.rows || data.rows.length === 0) {
        return [];
      }

      return data.rows.map((row) => {
        // GA4 returns date as YYYYMMDD, we need YYYY-MM-DD
        const rawDate = row.dimensionValues[0].value;
        const formattedDate = `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`;

        return {
          platform: this.platform,
          date: formattedDate,
          sessions: parseInt(row.metricValues[0].value, 10) || 0,
          users: parseInt(row.metricValues[1].value, 10) || 0,
          page_views: parseInt(row.metricValues[2].value, 10) || 0,
          avg_session_duration:
            parseFloat(row.metricValues[3].value) || 0,
          bounce_rate: parseFloat(row.metricValues[4].value) || 0,
        };
      });
    } catch (error) {
      console.error("GA4 fetchDailyAggregates failed:", error);
      throw error;
    }
  }

  async fetchTrafficSources(
    startDate: string,
    endDate: string
  ): Promise<GA4TrafficSource[]> {
    if (!this.propertyId || !this.serviceAccountJson) {
      return [];
    }

    try {
      const accessToken = await this.getAccessToken();

      const requestBody = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "sessionDefaultChannelGroup" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "bounceRate" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, descending: true }],
        limit: 10,
      };

      const response = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        throw new Error(`GA4 traffic sources API error: ${response.status}`);
      }

      const data: GA4RunReportResponse = await response.json();
      if (!data.rows) return [];

      return data.rows.map((row) => ({
        channel: row.dimensionValues[0].value,
        sessions: parseInt(row.metricValues[0].value, 10) || 0,
        users: parseInt(row.metricValues[1].value, 10) || 0,
        bounce_rate: parseFloat(row.metricValues[2].value) || 0,
      }));
    } catch (error) {
      console.error("GA4 fetchTrafficSources failed:", error);
      return [];
    }
  }

  async fetchTopPages(
    startDate: string,
    endDate: string
  ): Promise<GA4TopPage[]> {
    if (!this.propertyId || !this.serviceAccountJson) {
      return [];
    }

    try {
      const accessToken = await this.getAccessToken();

      const requestBody = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "pagePath" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "screenPageViews" },
          { name: "averageSessionDuration" },
        ],
        orderBys: [{ metric: { metricName: "screenPageViews" }, descending: true }],
        limit: 15,
      };

      const response = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        throw new Error(`GA4 top pages API error: ${response.status}`);
      }

      const data: GA4RunReportResponse = await response.json();
      if (!data.rows) return [];

      return data.rows.map((row) => ({
        page: row.dimensionValues[0].value,
        sessions: parseInt(row.metricValues[0].value, 10) || 0,
        users: parseInt(row.metricValues[1].value, 10) || 0,
        views: parseInt(row.metricValues[2].value, 10) || 0,
        avg_duration: parseFloat(row.metricValues[3].value) || 0,
      }));
    } catch (error) {
      console.error("GA4 fetchTopPages failed:", error);
      return [];
    }
  }

  async fetchGeographic(
    startDate: string,
    endDate: string
  ): Promise<GA4Geographic[]> {
    if (!this.propertyId || !this.serviceAccountJson) {
      return [];
    }

    try {
      const accessToken = await this.getAccessToken();

      const requestBody = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "country" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "bounceRate" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, descending: true }],
        limit: 15,
      };

      const response = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        throw new Error(`GA4 geographic API error: ${response.status}`);
      }

      const data: GA4RunReportResponse = await response.json();
      if (!data.rows) return [];

      return data.rows.map((row) => ({
        country: row.dimensionValues[0].value,
        sessions: parseInt(row.metricValues[0].value, 10) || 0,
        users: parseInt(row.metricValues[1].value, 10) || 0,
        bounce_rate: parseFloat(row.metricValues[2].value) || 0,
      }));
    } catch (error) {
      console.error("GA4 fetchGeographic failed:", error);
      return [];
    }
  }

  async fetchDeviceBreakdown(
    startDate: string,
    endDate: string
  ): Promise<GA4Device[]> {
    if (!this.propertyId || !this.serviceAccountJson) {
      return [];
    }

    try {
      const accessToken = await this.getAccessToken();

      const requestBody = {
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "deviceCategory" }],
        metrics: [
          { name: "sessions" },
          { name: "activeUsers" },
          { name: "bounceRate" },
        ],
        orderBys: [{ metric: { metricName: "sessions" }, descending: true }],
      };

      const response = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        throw new Error(`GA4 device breakdown API error: ${response.status}`);
      }

      const data: GA4RunReportResponse = await response.json();
      if (!data.rows) return [];

      return data.rows.map((row) => ({
        device: row.dimensionValues[0].value,
        sessions: parseInt(row.metricValues[0].value, 10) || 0,
        users: parseInt(row.metricValues[1].value, 10) || 0,
        bounce_rate: parseFloat(row.metricValues[2].value) || 0,
      }));
    } catch (error) {
      console.error("GA4 fetchDeviceBreakdown failed:", error);
      return [];
    }
  }
}
