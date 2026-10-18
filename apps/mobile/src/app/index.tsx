import { Redirect } from "expo-router";

import { today } from "@/lib/journal";

export default function Index() {
  return <Redirect href={{ pathname: "/journal/[date]", params: { date: today() } }} />;
}
