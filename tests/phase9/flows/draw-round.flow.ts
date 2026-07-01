import { AdminPage } from "../pages/admin.page";

export async function drawRound(adminPage: AdminPage, roundNumber: number) {
  await adminPage.setCurrentRound(roundNumber);
  await adminPage.drawCurrentRound(roundNumber);
}
