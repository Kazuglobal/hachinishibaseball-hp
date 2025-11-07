export interface Environment {
  production: boolean;
  gasWebAppUrl: string;
  stripe: {
    buyButtonId: string;
    publishableKey: string;
  };
}

export const environment: Environment = {
  production: false,
  gasWebAppUrl: 'https://script.google.com/macros/s/AKfycbzyCDimerLrk72zhc2_FYoSgHqypF0iNVdeucuuHkpr8oDePq-7_o_TTXhUpRkpg_Rr/exec',
  stripe: {
    buyButtonId: 'buy_btn_1QUVLMHpcbKROdRBduXnDbz3',
    publishableKey: 'pk_live_51QTaAoHpcbKROdRBG7egbxl9Q3UCN1lAdDjmLiR992s8cKnw9PDhvdXzDHet8xz18iJ7O3AM4MRNOVezQZVmzgBH00Frh0AElW'
  }
};

