import { useApp, AppProvider, css,
         AuthScreen, OnboardingScreen, PlanOverviewScreen,
         HomeDashboardScreen, ChatScreen } from "./Morphiq.jsx";
import { WorkoutScreen } from "./WorkoutScreen.jsx";
import { MealPlanScreen } from "./MealScreen.jsx";
import { GymOwnerDashboard, PricingScreen } from "./GymOwnerDashboard.jsx";
import { ProgressScreen, ProfileScreen, LoadingScreen, NetworkErrorScreen } from "./ProgressScreen.jsx";

// AppRouter.jsx is the root of the app.
// It is the ONLY file that imports from all screen files at once.
// Dependency graph (no cycles):
//   index.js → AppRouter.jsx
//   AppRouter.jsx → Morphiq.jsx (context, shared utils)
//   AppRouter.jsx → WorkoutScreen.jsx → Morphiq.jsx
//   AppRouter.jsx → MealScreen.jsx → Morphiq.jsx
//   AppRouter.jsx → GymOwnerDashboard.jsx
//   AppRouter.jsx → ProgressScreen.jsx → Morphiq.jsx

function AppRouter() {
  const { screen } = useApp();
  if (screen === "auth")          return <AuthScreen />;
  if (screen === "network_error") return <NetworkErrorScreen />;
  if (screen === "loading")       return <LoadingScreen />;
  if (screen === "onboarding")    return <OnboardingScreen />;
  if (screen === "plan")          return <PlanOverviewScreen />;
  if (screen === "workout")       return <WorkoutScreen />;
  if (screen === "meals")         return <MealPlanScreen />;
  if (screen === "progress")      return <ProgressScreen />;
  if (screen === "profile")       return <ProfileScreen />;
  if (screen === "owner")         return <GymOwnerDashboard />;
  if (screen === "chat")          return <ChatScreen fromScreen="home" />;
  if (screen === "chat_workout")  return <ChatScreen fromScreen="workout" />;
  if (screen === "chat_meals")    return <ChatScreen fromScreen="meals" />;
  if (screen === "pricing")       return <PricingScreen />;
  return <HomeDashboardScreen />;
}

export default function Morphiq() {
  return (
    <>
      <style>{css}</style>
      <AppProvider>
        <div className="mq-shell">
          <AppRouter />
        </div>
      </AppProvider>
    </>
  );
}
