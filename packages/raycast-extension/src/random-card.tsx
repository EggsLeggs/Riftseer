import { Detail, getPreferenceValues, showToast, Toast } from "@raycast/api";
import { useFetch } from "@raycast/utils";
import { CardDetail } from "./components/CardDetail";
import type { Card } from "./types";

interface Preferences {
  apiBaseUrl: string;
  siteBaseUrl: string;
}

export default function RandomCard() {
  const prefs = getPreferenceValues<Preferences>();
  const api = prefs.apiBaseUrl.replace(/\/$/, "");
  const site = prefs.siteBaseUrl.replace(/\/$/, "");

  const { data: card, isLoading, error } = useFetch<Card>(`${api}/api/v1/cards/random`, {
    onError: (err) => {
      showToast({ style: Toast.Style.Failure, title: "Failed to fetch random card", message: String(err) });
    },
  });

  if (isLoading) {
    return <Detail isLoading markdown="" />;
  }

  if (error || !card) {
    return <Detail markdown="**Failed to load a random card.** Check your API URL in preferences." />;
  }

  return <CardDetail card={card} siteBaseUrl={site} />;
}
