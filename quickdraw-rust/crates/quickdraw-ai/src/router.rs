use std::sync::Arc;
use quickdraw_core::state::AiMode;
use crate::provider::AIProvider;
use crate::task::{AITask, AITier};

pub struct ProviderRouter {
    pub fast_online: Arc<dyn AIProvider>,
    pub deep_online: Arc<dyn AIProvider>,
    pub local: Arc<dyn AIProvider>,
}

impl ProviderRouter {
    pub async fn resolve(&self, task: &AITask, mode: AiMode) -> Arc<dyn AIProvider> {
        match mode {
            AiMode::Online  => self.pick_online(task),
            AiMode::Offline => self.local.clone(),
            AiMode::Auto    => {
                if self.local.health_check().await {
                    self.local.clone()
                } else {
                    self.pick_online(task)
                }
            }
        }
    }

    fn pick_online(&self, task: &AITask) -> Arc<dyn AIProvider> {
        match task.tier() {
            AITier::Fast => self.fast_online.clone(),
            AITier::Deep => self.deep_online.clone(),
        }
    }
}
