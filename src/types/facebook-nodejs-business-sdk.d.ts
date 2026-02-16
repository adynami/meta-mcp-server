declare module 'facebook-nodejs-business-sdk' {
  class FacebookAdsApi {
    static init(accessToken: string): FacebookAdsApi;
    setDebug(debug: boolean): void;
  }

  class AdAccount {
    constructor(id: string);
    read(fields: string[]): Promise<any>;
    getCampaigns(fields: string[], params: Record<string, any>): Promise<any[]>;
    getAdSets(fields: string[], params: Record<string, any>): Promise<any[]>;
    getAds(fields: string[], params: Record<string, any>): Promise<any[]>;
    getInsights(fields: string[], params: Record<string, any>): Promise<any[]>;
    createCampaign(fields: string[], params: Record<string, any>): Promise<any>;
    createAdSet(fields: string[], params: Record<string, any>): Promise<any>;
    createAd(fields: string[], params: Record<string, any>): Promise<any>;
    createAdImage(fields: string[], params: Record<string, any>): Promise<any>;
  }

  class Campaign {
    constructor(id: string);
    read(fields: string[]): Promise<any>;
    update(fields: string[], params: Record<string, any>): Promise<any>;
    delete(fields: string[]): Promise<void>;
    getInsights(fields: string[], params: Record<string, any>): Promise<any[]>;
  }

  class AdSet {
    constructor(id: string);
    read(fields: string[]): Promise<any>;
    update(fields: string[], params: Record<string, any>): Promise<any>;
    delete(fields: string[]): Promise<void>;
  }

  class Ad {
    constructor(id: string);
    read(fields: string[]): Promise<any>;
    update(fields: string[], params: Record<string, any>): Promise<any>;
    delete(fields: string[]): Promise<void>;
  }

  const _default: {
    FacebookAdsApi: typeof FacebookAdsApi;
    AdAccount: typeof AdAccount;
    Campaign: typeof Campaign;
    AdSet: typeof AdSet;
    Ad: typeof Ad;
  };

  export default _default;
}
