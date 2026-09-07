import { Detail, showToast, Toast } from "@raycast/api";
import { usePromise } from "@raycast/utils";
import { CardDetail } from "./components/CardDetail";
import { parseMaxRecentHistory, useRecentCardHistory } from "./recentHistory";
import { riftseer } from "./client";

export default function RandomCard() {
  const { client, siteBaseUrl: site, maxRecentHistory } = riftseer();
  const maxRecent = parseMaxRecentHistory(maxRecentHistory);
  const { recordVisit } = useRecentCardHistory(maxRecent);

  const { data: result, isLoading } = usePromise(
    () => client.cards.random(),
    [],
    {
      onData: (fetched) => {
        if (fetched.ok) return;
        showToast({
          style: Toast.Style.Failure,
          title: "Failed to fetch random card",
          message: fetched.error.error,
        });
      },
    },
  );

  if (isLoading) {
    return <Detail isLoading markdown="" />;
  }

  if (!result?.ok) {
    return (
      <Detail markdown="**Failed to load a random card.** Check your API URL in preferences." />
    );
  }

  return (
    <CardDetail card={result.data} siteBaseUrl={site} onView={recordVisit} />
  );
}
